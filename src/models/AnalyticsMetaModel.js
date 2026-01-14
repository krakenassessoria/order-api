// AnalyticsMetaModel.js
import mongoose from 'mongoose';

const AnalyticsMetaSchema = new mongoose.Schema({
  _id: String,
  lastRun: Date,
  updatedAt: Date,
}, { collection: 'analyticsMeta' });

export const AnalyticsMetaModel = mongoose.models.AnalyticsMetaModel
  || mongoose.model('AnalyticsMetaModel', AnalyticsMetaSchema);
