//! Pure queue mutations. Persistence and host authorization live in [`super::Sessions`].

use rand::seq::SliceRandom;

#[derive(Debug, thiserror::Error, PartialEq, Eq)]
pub enum QueueError {
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

/// Keep the currently playing track at the cursor and shuffle only what follows it. This
/// means pressing shuffle never changes the song already coming from the speakers.
pub fn shuffle(queue: &mut [String], cursor: Option<usize>) {
    let start = cursor.map_or(0, |cursor| cursor.saturating_add(1));
    if start < queue.len() {
        queue[start..].shuffle(&mut rand::thread_rng());
    }
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

        shuffle(&mut queue, Some(1));

        assert_eq!(queue[1], "b");
        assert_eq!(queue[0], "a");
    }
}
