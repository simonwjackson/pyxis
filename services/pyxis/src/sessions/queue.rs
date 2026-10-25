//! Pure queue mutations. Persistence and host authorization live in [`super::Sessions`].

#[derive(Debug, thiserror::Error, PartialEq, Eq)]
pub enum QueueError {
    #[error("queue occurrence order is invalid or exhausted")]
    InvalidOrder,
    #[error("queue index {index} is outside a queue of length {length}")]
    Index { index: usize, length: usize },
}

pub fn add(queue: &mut Vec<String>, cursor: &mut Option<usize>, track_ids: Vec<String>) {
    queue.extend(track_ids);
    if cursor.is_none() && !queue.is_empty() {
        *cursor = Some(0);
    }
}

/// Returns true when the removed item was the current track.
pub fn remove(
    queue: &mut Vec<String>,
    cursor: &mut Option<usize>,
    index: usize,
) -> Result<bool, QueueError> {
    if index >= queue.len() {
        return Err(QueueError::Index {
            index,
            length: queue.len(),
        });
    }
    let was_current = *cursor == Some(index);
    queue.remove(index);
    *cursor = match (*cursor, queue.is_empty()) {
        (_, true) => None,
        (Some(current), false) if index < current => Some(current - 1),
        (Some(current), false) if current >= queue.len() => Some(queue.len() - 1),
        (current, false) => current,
    };
    Ok(was_current)
}

pub fn clear(queue: &mut Vec<String>, cursor: &mut Option<usize>) {
    queue.clear();
    *cursor = None;
}

/// Original order is an ordinal per occurrence, never a track ID. Duplicate recordings
/// therefore remain distinct through toggles and edits. The same pure permutation runs
/// in the offline worker and core so replay does not change an already-confirmed queue.
pub fn validate_order(queue: &[String], order: &[u32]) -> Result<(), QueueError> {
    if queue.len() != order.len()
        || order.iter().collect::<std::collections::HashSet<_>>().len() != order.len()
    {
        return Err(QueueError::InvalidOrder);
    }
    Ok(())
}

pub fn seed(id: &str) -> u32 {
    id.bytes().fold(2166136261, |seed, byte| {
        (seed ^ u32::from(byte)).wrapping_mul(16777619)
    })
}

fn rank(mut value: u32) -> u32 {
    value ^= value >> 16;
    value = value.wrapping_mul(0x7feb352d);
    value ^= value >> 15;
    value = value.wrapping_mul(0x846ca68b);
    value ^ (value >> 16)
}

pub fn reorder(
    queue: &mut Vec<String>,
    order: &mut Vec<u32>,
    cursor: &mut Option<usize>,
    enabled: bool,
    seed: u32,
) -> Result<(), QueueError> {
    validate_order(queue, order)?;
    let current = cursor.and_then(|cursor| order.get(cursor)).copied();
    let mut entries: Vec<_> = queue.drain(..).zip(order.drain(..)).collect();
    if enabled {
        let start = cursor
            .map_or(0, |cursor| cursor.saturating_add(1))
            .min(entries.len());
        entries[start..].sort_by_key(|(_, id)| (rank(*id ^ seed), *id));
    } else {
        entries.sort_by_key(|(_, id)| *id);
    }
    for (track, id) in entries {
        queue.push(track);
        order.push(id);
    }
    *cursor = current.and_then(|id| order.iter().position(|candidate| *candidate == id));
    Ok(())
}

pub fn jump(queue: &[String], cursor: &mut Option<usize>, index: usize) -> Result<(), QueueError> {
    if index >= queue.len() {
        return Err(QueueError::Index {
            index,
            length: queue.len(),
        });
    }
    *cursor = Some(index);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn removing_before_the_cursor_preserves_the_current_track() {
        let mut queue = vec!["a".into(), "b".into(), "c".into()];
        let mut cursor = Some(2);

        remove(&mut queue, &mut cursor, 0).expect("remove");

        assert_eq!(queue, ["b", "c"]);
        assert_eq!(cursor, Some(1));
    }

    #[test]
    fn shuffle_keeps_the_current_track_in_place() {
        let mut queue = vec!["a".into(), "b".into(), "c".into(), "d".into()];

        let mut order = vec![0, 1, 2, 3];
        let mut cursor = Some(1);
        reorder(&mut queue, &mut order, &mut cursor, true, 17).expect("shuffle");

        assert_eq!(queue[1], "b");
        assert_eq!(queue[0], "a");
    }
    #[test]
    fn effective_order_matches_the_worker_wire_vector() {
        let mut queue = vec![
            "a".into(),
            "b".into(),
            "a".into(),
            "c".into(),
            "d".into(),
            "e".into(),
        ];
        let mut order = vec![0, 1, 2, 3, 4, 5];
        let mut cursor = Some(1);
        reorder(&mut queue, &mut order, &mut cursor, true, seed("session-1")).unwrap();
        assert_eq!(order, [0, 1, 5, 3, 4, 2]);
        assert_eq!(cursor, Some(1));
        reorder(
            &mut queue,
            &mut order,
            &mut cursor,
            false,
            seed("session-1"),
        )
        .unwrap();
        assert_eq!(queue, ["a", "b", "a", "c", "d", "e"]);
    }
}
