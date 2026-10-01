const slugify = (text) =>
  String(text)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

/**
 * Returns a slug that is not used yet in `Model` (slug has a unique index),
 * appending -2, -3... when the base slug is already taken.
 */
const uniqueSlug = async (Model, text) => {
  const base = slugify(text) || "item";
  let candidate = base;
  let suffix = 2;
  while (await Model.exists({ slug: candidate })) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  return candidate;
};

module.exports = { slugify, uniqueSlug };
