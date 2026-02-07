

export interface CartItemInput {
  medicineId: string;
  batchNo: string;
  quantity: number;
}

export interface SaleInput {
  items: CartItemInput[];
  customerName?: string;
  customerPhone?: string;
  customerEmail?: string;
  paymentMethod?: "cash" | "card" | "UPI";
  paidAmount: number;
}

export interface CartItem {
  medicineId: string;
  batchNo: string;
  name: string;
  unitPrice: number;
  quantity: number;
  total: number;
}

export interface SaleRecord {
  saleId: string;
  timestamp: Date;
  items: CartItem[];
  totalAmount: number;
  paidAmount: number;
  change: number;
  customerName?: string;
  customerPhone?: string;
  customerEmail?: string;
  paymentMethod?: string;
  invoiceNumber?: string;
}
