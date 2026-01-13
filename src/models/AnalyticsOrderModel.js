// AnalyticsOrderModel.js
import mongoose from 'mongoose';

const AnalyticsOrderSchema = new mongoose.Schema({
  _id: String,
  buyerId: String,
  productsId: String,
  reservationDate: String,
  createdAt: Date,
  userCreatedAt: Date,
  birthDateNormalized: Date,
  userCity: String,
  userState: String,
  userCityNorm: String,
  userStateNorm: String,
  userName: String,
  userEmail: String,
  userPhone: String,
  updatedAt: Date,
}, { collection: 'analyticsOrders' });

AnalyticsOrderSchema.index({ createdAt: 1, productsId: 1, userStateNorm: 1, userCityNorm: 1 });
AnalyticsOrderSchema.index({ reservationDate: 1, productsId: 1 });
AnalyticsOrderSchema.index({ userCreatedAt: 1 });
AnalyticsOrderSchema.index({ buyerId: 1 });

export const AnalyticsOrderModel = mongoose.models.AnalyticsOrderModel
  || mongoose.model('AnalyticsOrderModel', AnalyticsOrderSchema);
