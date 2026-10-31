// Bookkeeping that public endpoints must not expose: staff ids (who created/reviewed), review notes, soft-delete state.
const INTERNAL_FIELDS = ["createdBy", "updatedBy", "reviewedBy", "reviewedAt", "reviewNote", "isDeleted", "deletedAt", "deletedBy", "__v"];

const toPublic = (document) => {
  const view = { ...document };
  INTERNAL_FIELDS.forEach((field) => delete view[field]);
  return view;
};

// For the owner of a reviewed item: they read the decision and its note, not which staff member made it
const withoutReviewer = ({ reviewedBy, ...view }) => view;

module.exports = { toPublic, withoutReviewer };
