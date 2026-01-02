import mongoose from 'mongoose';

const downloadSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  fileName: { type: String, required: true },
  fileSize: { type: Number },
  fileUrl: { type: String, required: true },
  status: { 
    type: String, 
    enum: ['pending', 'downloading', 'completed', 'failed'],
    default: 'pending'
  },
  type: {
    type: String,
    enum: ['regular', 'video', 'audio'],
    default: 'regular'
  },
  metadata: {
    platform: String,
    duration: Number,
    thumbnail: String,
    quality: String,
    format: String,
    resolution: String,
    codec: String
  },
  timestamp: { type: Date, default: Date.now },
  completedAt: { type: Date },
  error: { type: String }
}, {
  timestamps: true
});

// Index for better query performance
downloadSchema.index({ user: 1, timestamp: -1 });
downloadSchema.index({ status: 1 });
downloadSchema.index({ type: 1 });

export default mongoose.model('Download', downloadSchema);