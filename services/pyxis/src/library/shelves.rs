use serde::{Deserialize, Serialize};
use ulid::Ulid;

use super::{now, AlbumPage, Library, LibraryError};
use crate::db::{schema, store::AccountId};
use crate::rpc::contract::{
    tag_expression::RpcTagExpression, AlbumsQueryRequest, RpcAlbumSort, RpcShelf,
    ShelfAlbumsListRequest, ShelfSaveRequest,
};

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct ShelfRecord {
    id: String,
    name: String,
    tag_expression: RpcTagExpression,
    sort: RpcAlbumSort,
    revision: u32,
    updated_by: String,
    updated_at: String,
}

impl From<ShelfRecord> for RpcShelf {
    fn from(record: ShelfRecord) -> Self {
        Self {
            id: record.id,
            name: record.name,
            tag_expression: record.tag_expression,
            sort: record.sort,
            revision: record.revision,
        }
    }
}

impl Library {
    fn shelf(&self, account: &AccountId, id: &str) -> Result<ShelfRecord, LibraryError> {
        self.store
            .get(schema::SHELVES, account, id)?
            .ok_or(LibraryError::UnknownShelf)
    }
    fn checked_shelf(
        &self,
        account: &AccountId,
        id: &str,
        expected: u32,
    ) -> Result<ShelfRecord, LibraryError> {
        let shelf = self.shelf(account, id)?;
        if shelf.revision != expected {
            return Err(LibraryError::ShelfConflict(shelf.revision));
        }
        Ok(shelf)
    }
    pub(crate) fn save_shelf(
        &self,
        account: &AccountId,
        mut request: ShelfSaveRequest,
        updated_by: &str,
    ) -> Result<RpcShelf, LibraryError> {
        let name = request.name.trim();
        if name.is_empty() || name.chars().count() > 128 || name.chars().any(char::is_control) {
            return Err(LibraryError::InvalidShelf(
                "shelf name must be 1..128 characters without controls",
            ));
        }
        request
            .tag_expression
            .normalize()
            .map_err(LibraryError::InvalidShelf)?;
        let _guard = self.mutation.lock().expect("library mutation poisoned");
        let (id, revision) = match (request.shelf_id, request.expected_revision) {
            (None, None) => (Ulid::new().to_string(), 1),
            (Some(id), Some(expected)) => {
                let shelf = self.checked_shelf(account, &id, expected)?;
                (
                    id,
                    shelf
                        .revision
                        .checked_add(1)
                        .ok_or(LibraryError::InvalidShelf("shelf revision exhausted"))?,
                )
            }
            _ => {
                return Err(LibraryError::InvalidShelf(
                    "replacement needs both shelfId and expectedRevision",
                ))
            }
        };
        let record = ShelfRecord {
            id,
            name: name.into(),
            revision,
            tag_expression: request.tag_expression,
            sort: request.sort,
            updated_at: now(),
            updated_by: updated_by.into(),
        };
        self.store
            .put(schema::SHELVES, account, &record.id, &record)?;
        Ok(record.into())
    }
    pub(crate) fn remove_shelf(
        &self,
        account: &AccountId,
        id: &str,
        expected: u32,
    ) -> Result<(), LibraryError> {
        let _guard = self.mutation.lock().expect("library mutation poisoned");
        self.checked_shelf(account, id, expected)?;
        self.store.delete(schema::SHELVES, account, id)?;
        Ok(())
    }
    pub(crate) fn list_shelves(&self, account: &AccountId) -> Result<Vec<RpcShelf>, LibraryError> {
        let mut shelves: Vec<RpcShelf> = self
            .store
            .list::<ShelfRecord>(schema::SHELVES, account)?
            .into_iter()
            .map(Into::into)
            .collect();
        shelves.sort_by(|a, b| a.name.cmp(&b.name).then_with(|| a.id.cmp(&b.id)));
        Ok(shelves)
    }
    pub(crate) fn shelf_albums(
        &self,
        cursors: &crate::sealed_tokens::SealedTokens,
        account: &AccountId,
        request: ShelfAlbumsListRequest,
    ) -> Result<AlbumPage, LibraryError> {
        let shelf = self.shelf(account, &request.shelf_id)?;
        let mut query = AlbumsQueryRequest {
            limit: request.limit,
            cursor: request.cursor,
            ..Default::default()
        };
        if query.cursor.is_none() {
            query.tag_expression = Some(shelf.tag_expression);
            query.sort = Some(shelf.sort);
        }
        self.query_page(cursors, account, Some(&shelf.id), query)
    }
}
