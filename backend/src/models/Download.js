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
  timestamp: { type: Date, default: Date.now },
  error: { type: String }
});

export default mongoose.model('Download', downloadSchema);