import mongoose from "mongoose";
import Batch from "../models/Batch";

/**
 * Compute total active stock for one product.
 */
export async function getProductStock(
  productId: mongoose.Types.ObjectId | string,
  pharmacyId: mongoose.Types.ObjectId | string
): Promise<number> {
  const result = await Batch.aggregate([
    {
      $match: {
        pharmacyId: new mongoose.Types.ObjectId(String(pharmacyId)),
        productId: new mongoose.Types.ObjectId(String(productId)),
        status: "ACTIVE",
        currentQuantity: { $gt: 0 },
        expiryDate: { $gt: new Date() },
      },
    },
    { $group: { _id: null, totalStock: { $sum: "$currentQuantity" } } },
  ]);
  return result[0]?.totalStock ?? 0;
}

/**
 * Compute stock for multiple products in one query.
 * Returns Map<productId-string, stockNumber>.
 */
export async function getStockForProducts(
  productIds: (mongoose.Types.ObjectId | string)[],
  pharmacyId: mongoose.Types.ObjectId | string
): Promise<Map<string, number>> {
  if (!productIds.length) return new Map();
  const ids = productIds.map((id) => new mongoose.Types.ObjectId(String(id)));
  const result = await Batch.aggregate([
    {
      $match: {
        pharmacyId: new mongoose.Types.ObjectId(String(pharmacyId)),
        productId: { $in: ids },
        status: "ACTIVE",
        currentQuantity: { $gt: 0 },
        expiryDate: { $gt: new Date() },
      },
    },
    { $group: { _id: "$productId", stock: { $sum: "$currentQuantity" } } },
  ]);
  return new Map(result.map((r) => [String(r._id), r.stock as number]));
}

export function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Find or create a Generic by (genericName, strength, dosageForm), case-insensitive.
 */
export async function findOrCreateGeneric(params: {
  pharmacyId: mongoose.Types.ObjectId | string;
  userId: mongoose.Types.ObjectId | string;
  genericName: string;
  strength: string;
  dosageForm: string;
  category?: string;
  therapeuticClass?: string;
  session?: mongoose.ClientSession;
}) {
  const GenericMedicine = (await import("../models/GenericMedicine")).default;
  const { pharmacyId, userId, genericName, strength, dosageForm, category, therapeuticClass, session } = params;

  let generic = await GenericMedicine.findOne({
    pharmacyId,
    genericName,
    strength,
    dosageForm,
  })
    .collation({ locale: "en", strength: 2 })
    .session(session ?? null);

  if (!generic) {
    const created = await GenericMedicine.create(
      [
        {
          pharmacyId,
          genericName,
          strength,
          dosageForm,
          category,
          therapeuticClass,
          createdBy: userId,
        },
      ],
      { session }
    );
    generic = created[0];
  }
  return generic;
}

/**
 * Find or create a Product by (pharmacyId, productCode).
 */
export async function findOrCreateProduct(params: {
  pharmacyId: mongoose.Types.ObjectId | string;
  userId: mongoose.Types.ObjectId | string;
  genericId: mongoose.Types.ObjectId;
  productCode: string;
  brandName: string;
  manufacturer: string;
  barcode?: string;
  packSize?: number;
  unit?: string;
  defaultSellingPrice: number;
  reorderLevel?: number;
  session?: mongoose.ClientSession;
}) {
  const ProductMedicine = (await import("../models/ProductMedicine")).default;
  const { pharmacyId, userId, genericId, productCode, session, ...rest } = params;

  let product = await ProductMedicine.findOne({ pharmacyId, productCode }).session(session ?? null);

  if (!product) {
    const created = await ProductMedicine.create(
      [
        {
          pharmacyId,
          genericId,
          productCode,
          brandName: rest.brandName,
          manufacturer: rest.manufacturer,
          barcode: rest.barcode,
          packSize: rest.packSize ?? 1,
          unit: rest.unit ?? "unit",
          defaultSellingPrice: rest.defaultSellingPrice,
          reorderLevel: rest.reorderLevel ?? 0,
          createdBy: userId,
        },
      ],
      { session }
    );
    product = created[0];
  }
  return product;
}