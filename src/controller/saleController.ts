// // import { Request, Response } from "express";
// // import Sale from "../models/Sale";
// // import Medicine from "../models/Medicine";
// // import Customer from "../models/Customer";
// // import { v4 as uuidv4 } from "uuid";

// // /**
// //  * Helper to clean up phone strings
// //  */
// // function normalizePhone(phone: any) {
// //   return String(phone ?? "").trim();
// // }

// // export const createSale = async (req: Request, res: Response) => {
// //   try {
// //     const pharmacyId = (req.user as any)?.pharmacyId;

// //     if (!pharmacyId) {
// //       return res.status(401).json({ message: "Unauthorized: pharmacyId missing" });
// //     }

// //     const data = req.body;

// //     // 1. Validation: Ensure items exist
// //     if (!data.items || data.items.length === 0) {
// //       return res.status(400).json({ message: "No items provided for sale." });
// //     }

// //     // 2. Customer Resolution Logic
// //     const phone = data.customerPhone ? normalizePhone(data.customerPhone) : "";
    
// //     // Default fallback values
// //     let resolvedCustomerName: string = "Walk-in Customer"; 
// //     let resolvedCustomerEmail: string | undefined = undefined;

// //     if (phone) {
// //       // Try to find registered customer by phone
// //       const customer = await Customer.findOne({ pharmacyId, phone }).select("name email");
      
// //       if (customer) {
// //         resolvedCustomerName = customer.name || "Registered Customer";
// //         resolvedCustomerEmail = (customer as any).email || undefined;
// //       } else if (data.customerName?.trim()) {
// //         // If phone is provided but not in DB, use the manually typed name
// //         resolvedCustomerName = data.customerName.trim();
// //       }
// //     } else if (data.customerName?.trim()) {
// //       // If no phone is provided, but a name was typed manually
// //       resolvedCustomerName = data.customerName.trim();
// //     }

// //     let totalAmount = 0;
// //     const saleItems = [];

// //     // 3. Inventory Processing Loop
// //     for (const item of data.items) {
// //       const medicine = await Medicine.findOne({
// //         pharmacyId,
// //         medicineId: item.medicineId,
// //         batchNo: item.batchNo,
// //       });

// //       if (!medicine) {
// //         return res.status(404).json({ 
// //           message: `Medicine ${item.name} (Batch: ${item.batchNo}) not found in inventory.` 
// //         });
// //       }

// //       // Check Stock Availability
// //       if (medicine.stock < item.quantity) {
// //         return res.status(400).json({ 
// //           message: `Insufficient stock for ${medicine.name}. Available: ${medicine.stock}` 
// //         });
// //       }

// //       const itemTotal = medicine.sellingPrice * item.quantity;
// //       totalAmount += itemTotal;

// //       // Prepare item for Sale Record (including costPrice for Profit/Loss reports)
// //       saleItems.push({
// //         medicineId: item.medicineId,
// //         batchNo: medicine.batchNo,
// //         name: medicine.name,
// //         unitPrice: medicine.sellingPrice, 
// //         costPrice: medicine.costPrice, 
// //         quantity: item.quantity,
// //         total: itemTotal,
// //       });

// //       // Update Stock Levels
// //       medicine.stock -= item.quantity;
// //       await medicine.save();
// //     }

// //     // 4. Financial Calculations
// //     const paidAmount = data.paidAmount ?? totalAmount;
// //     const change = paidAmount - totalAmount;

// //     if (change < 0) {
// //       return res.status(400).json({ 
// //         message: "Paid amount is less than total amount due.", 
// //         totalAmount 
// //       });
// //     }

// //     // 5. Create the Final Sale Record
// //     const saleRecord = await Sale.create({
// //       pharmacyId,
// //       saleId: uuidv4(),
// //       items: saleItems,
// //       totalAmount,
// //       paidAmount,
// //       change,
// //       customerName: resolvedCustomerName,
// //       customerPhone: phone || "Walk-in",
// //       customerEmail: resolvedCustomerEmail,
// //       paymentMethod: data.paymentMethod || "CASH",
// //       invoiceNumber: `INV-${Date.now()}`,
// //       linkedSaleId: data.linkedSaleId || undefined, 
// //     });

// //     return res.status(201).json({
// //       success: true,
// //       message: "Sale processed successfully ✅",
// //       sale: saleRecord,
// //     });

// //   } catch (error: any) {
// //     console.error("Critical Sale Error:", error);
// //     return res.status(500).json({ 
// //       success: false,
// //       message: "Internal Server Error during sale processing.", 
// //       error: error.message 
// //     });
// //   }
// // };

// import { Request, Response } from "express";
// import mongoose from "mongoose";
// import { v4 as uuidv4 } from "uuid";
// import Sale from "../models/Sale";
// import Batch from "../models/Batch";
// import ProductMedicine from "../models/ProductMedicine";
// import Customer from "../models/Customer";

// interface SaleItemInput {
//   productId: string;
//   quantity: number;
// }

// function normalizePhone(phone: any) {
//   return String(phone ?? "").trim();
// }

// export const createSale = async (req: Request, res: Response) => {
//   const session = await mongoose.startSession();
//   try {
//     session.startTransaction();

//     const pharmacyId = req.user?.pharmacyId;
//     if (!pharmacyId) {
//       await session.abortTransaction();
//       return res.status(401).json({ message: "Unauthorized: pharmacyId missing" });
//     }

//     const data = req.body;
//     const items = data.items as SaleItemInput[];
//     if (!items?.length) throw new Error("No items provided for sale");

//     // Customer resolution
//     const phone = data.customerPhone ? normalizePhone(data.customerPhone) : "";
//     let resolvedCustomerName = "Walk-in Customer";
//     let resolvedCustomerEmail: string | undefined;

//     if (phone) {
//       const customer = await Customer.findOne({ pharmacyId, phone })
//         .select("name email")
//         .session(session);
//       if (customer) {
//         resolvedCustomerName = customer.name || "Registered Customer";
//         resolvedCustomerEmail = (customer as any).email || undefined;
//       } else if (data.customerName?.trim()) {
//         resolvedCustomerName = data.customerName.trim();
//       }
//     } else if (data.customerName?.trim()) {
//       resolvedCustomerName = data.customerName.trim();
//     }

//     let totalAmount = 0;
//     const saleItems: any[] = [];

//     for (const item of items) {
//       let remaining = Number(item.quantity);
//       if (!remaining || remaining <= 0) throw new Error("Each item must have quantity > 0");

//       const product = await ProductMedicine.findOne({
//         _id: item.productId,
//         pharmacyId,
//         isActive: true,
//         posStatus: "ACTIVE",
//       }).session(session);
//       if (!product) throw new Error(`Product ${item.productId} not available for sale`);

//       // FEFO: oldest expiry first
//       const candidates = await Batch.find({
//         pharmacyId,
//         productId: item.productId,
//         status: "ACTIVE",
//         currentQuantity: { $gt: 0 },
//         expiryDate: { $gt: new Date() },
//       })
//         .sort({ expiryDate: 1, createdAt: 1 })
//         .session(session);

//       for (const batch of candidates) {
//         if (remaining <= 0) break;
//         const take = Math.min(batch.currentQuantity, remaining);

//         // Atomic, race-safe decrement
//         const updated = await Batch.findOneAndUpdate(
//           {
//             _id: batch._id,
//             currentQuantity: { $gte: take },
//             status: "ACTIVE",
//           },
//           {
//             $inc: { currentQuantity: -take },
//             ...(batch.currentQuantity === take && { $set: { status: "DEPLETED" } }),
//           },
//           { new: true, session }
//         );
//         if (!updated) continue; // someone else got it; try next batch

//         const lineTotal = batch.sellingPrice * take;
//         totalAmount += lineTotal;

//         saleItems.push({
//           productId: product._id,
//           batchId: batch._id,
//           productName: product.brandName,
//           batchNumber: batch.batchNumber,
//           quantity: take,
//           unitPrice: batch.sellingPrice,
//           costPrice: batch.costPrice,
//           total: lineTotal,
//         });

//         remaining -= take;
//       }

//       if (remaining > 0) {
//         throw new Error(
//           `Insufficient stock for ${product.brandName}. Short by ${remaining} unit(s).`
//         );
//       }
//     }

//     const paidAmount = data.paidAmount ?? totalAmount;
//     const change = paidAmount - totalAmount;
//     if (change < 0) throw new Error("Paid amount is less than total amount due");

//     const [saleRecord] = await Sale.create(
//       [
//         {
//           pharmacyId,
//           saleId: uuidv4(),
//           items: saleItems,
//           totalAmount,
//           paidAmount,
//           change,
//           customerName: resolvedCustomerName,
//           customerPhone: phone || "Walk-in",
//           customerEmail: resolvedCustomerEmail,
//           paymentMethod: data.paymentMethod || "CASH",
//           invoiceNumber: `INV-${Date.now()}`,
//         },
//       ],
//       { session }
//     );

//     await session.commitTransaction();
//     session.endSession();

//     return res.status(201).json({
//       success: true,
//       message: "Sale processed successfully",
//       sale: saleRecord,
//     });
//   } catch (err: any) {
//     if (session.inTransaction()) await session.abortTransaction();
//     session.endSession();
//     console.error("Sale error:", err);
//     return res.status(400).json({ success: false, message: err.message || "Sale failed" });
//   }
// };

import { Request, Response } from "express";
import mongoose from "mongoose";
import { v4 as uuidv4 } from "uuid";
import Sale from "../models/Sale";
import Batch from "../models/Batch";
import ProductMedicine from "../models/ProductMedicine";
import Customer from "../models/Customer";

interface SaleItemInput {
  productId: string;
  quantity: number;
}

function normalizePhone(phone: any) {
  return String(phone ?? "").trim();
}

export const createSale = async (req: Request, res: Response) => {
  const session = await mongoose.startSession();
  try {
    session.startTransaction();

    const pharmacyId = req.user?.pharmacyId;
    if (!pharmacyId) {
      await session.abortTransaction();
      return res.status(401).json({ message: "Unauthorized: pharmacyId missing" });
    }

    const data = req.body;
    const items = data.items as SaleItemInput[];
    if (!items?.length) throw new Error("No items provided for sale");

    // Customer resolution
    const phone = data.customerPhone ? normalizePhone(data.customerPhone) : "";
    let resolvedCustomerName = "Walk-in Customer";
    let resolvedCustomerEmail: string | undefined;

    if (phone) {
      const customer = await Customer.findOne({ pharmacyId, phone })
        .select("name email")
        .session(session);
      if (customer) {
        resolvedCustomerName = customer.name || "Registered Customer";
        resolvedCustomerEmail = (customer as any).email || undefined;
      } else if (data.customerName?.trim()) {
        resolvedCustomerName = data.customerName.trim();
      }
    } else if (data.customerName?.trim()) {
      resolvedCustomerName = data.customerName.trim();
    }

    let totalAmount = 0;
    const saleItems: any[] = [];

    for (const item of items) {
      let remaining = Number(item.quantity);
      if (!remaining || remaining <= 0) throw new Error("Each item must have quantity > 0");

      const product = await ProductMedicine.findOne({
        _id: item.productId,
        pharmacyId,
        isActive: true,
        posStatus: "ACTIVE",
      }).session(session);
      if (!product) throw new Error(`Product ${item.productId} not available for sale`);

      // FEFO: oldest expiry first
      const candidates = await Batch.find({
        pharmacyId,
        productId: item.productId,
        status: "ACTIVE",
        currentQuantity: { $gt: 0 },
        expiryDate: { $gt: new Date() },
      })
        .sort({ expiryDate: 1, createdAt: 1 })
        .session(session);

      for (const batch of candidates) {
        if (remaining <= 0) break;
        const take = Math.min(batch.currentQuantity, remaining);

        // Atomic, race-safe decrement
        const updated = await Batch.findOneAndUpdate(
          {
            _id: batch._id,
            currentQuantity: { $gte: take },
            status: "ACTIVE",
          },
          {
            $inc: { currentQuantity: -take },
            ...(batch.currentQuantity === take && { $set: { status: "DEPLETED" } }),
          },
          { new: true, session }
        );
        if (!updated) continue; // someone else got it; try next batch

        const lineTotal = batch.sellingPrice * take;
        totalAmount += lineTotal;

        saleItems.push({
          productId: product._id,
          batchId: batch._id,
          productName: product.brandName,
          batchNumber: batch.batchNumber,
          quantity: take,
          unitPrice: batch.sellingPrice,
          costPrice: batch.costPrice,
          total: lineTotal,
        });

        remaining -= take;
      }

      if (remaining > 0) {
        throw new Error(
          `Insufficient stock for ${product.brandName}. Short by ${remaining} unit(s).`
        );
      }
    }

    const paidAmount = data.paidAmount ?? totalAmount;
    const change = paidAmount - totalAmount;
    if (change < 0) throw new Error("Paid amount is less than total amount due");

    const [saleRecord] = await Sale.create(
      [
        {
          pharmacyId,
          saleId: uuidv4(),
          items: saleItems,
          totalAmount,
          paidAmount,
          change,
          customerName: resolvedCustomerName,
          customerPhone: phone || "Walk-in",
          customerEmail: resolvedCustomerEmail,
          paymentMethod: data.paymentMethod || "CASH",
          invoiceNumber: `INV-${Date.now()}`,
        },
      ],
      { session }
    );

    await session.commitTransaction();
    session.endSession();

    return res.status(201).json({
      success: true,
      message: "Sale processed successfully",
      sale: saleRecord,
    });
  } catch (err: any) {
    if (session.inTransaction()) await session.abortTransaction();
    session.endSession();
    console.error("Sale error:", err);
    return res.status(400).json({ success: false, message: err.message || "Sale failed" });
  }
};