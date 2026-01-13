import mongoose from 'mongoose';

const uri = process.env.MONGODB_URI;

if (!uri) throw new Error('MONGODB_URI não definida');

let isConnected;

export async function connectDB() {
  if (isConnected) return;

  try {
    await mongoose.connect(uri);
    isConnected = true;
    console.log("Conectado ao MongoDB");
  } catch (err) {
    console.error("Erro ao conectar no MongoDB:", err);
    throw err;
  }
}
