// OrderModel.js
import mongoose from 'mongoose';

const OrderSchema = new mongoose.Schema({
  _id: String,
  title: String,
  status: String,
  reservationDate: String,
  reservationTime: String,
  adults: String,
  childrenFree: String,
  childrenPay: String,
  totalPrice: Number,
  tablesIdms: [Number],
  paymentType: String,
  buyerId: String,
  productsId: String,
  notes: String,
  buyerPhoneNumber: String,
  phoneNumber: String,
  date: String,
  type: String,
  createdAt: Date,
  coupon: String,
}, { collection: 'aposDocs' });

// Helpful indexes to speed up common queries/filters
OrderSchema.index({ reservationDate: 1, reservationTime: 1, productsId: 1, status: 1, type: 1 });
OrderSchema.index({ buyerPhoneNumber: 1 });
OrderSchema.index({ date: 1 });

export const OrderModel = mongoose.models.OrderModel || mongoose.model('OrderModel', OrderSchema);
