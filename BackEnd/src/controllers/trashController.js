const trashService = require("../services/trashService");
const { handle, parsePaging } = require("../utils/http");

exports.listTrash = handle((req) => trashService.listTrash(req.query, parsePaging(req.query)));

exports.getTrashDetail = handle((req) => trashService.getTrashDetail(req.params.type, req.params.id));

exports.restoreTrashItem = handle((req) => trashService.restoreTrash(req.user.id, req.params.type, req.params.id));

exports.permanentDeleteTrashItem = handle((req) =>
  trashService.permanentDeleteTrashItem(
    req.user.id,
    req.params.type,
    req.params.id,
    req.body?.reason || req.query?.reason
  )
);
