import User from '../models/User.js';
import { generateToken } from '../utils/tokenUtils.js';
import { asyncHandler, AppError } from '../middlewares/errorMiddleware.js';
import logger from '../utils/logger.js';

export const signup = asyncHandler(async (req, res, next) => {
  const { username, email, password } = req.body;
  
  // Check if user exists
  const existingUser = await User.findOne({ 
    $or: [{ email }, { username }] 
  });
  
  if (existingUser) {
    throw new AppError('User with this email or username already exists', 400);
  }
  
  // Create user
  const user = await User.create({
    username,
    email,
    password
  });
  
  // Generate token
  const token = generateToken(user._id);
  
  // Remove password from response
  user.password = undefined;
  
  logger.info(`New user registered: ${user.email}`);
  
  res.status(201).json({
    success: true,
    token,
    user: {
      id: user._id,
      username: user.username,
      email: user.email,
      createdAt: user.createdAt
    }
  });
});

export const login = asyncHandler(async (req, res, next) => {
  const { email, password } = req.body;
  
  // Check if email and password exist
  if (!email || !password) {
    throw new AppError('Please provide email and password', 400);
  }
  
  // Check if user exists
  const user = await User.findOne({ email }).select('+password');
  
  if (!user) {
    throw new AppError('Invalid credentials', 401);
  }
  
  // Check if password is correct
  const isPasswordCorrect = await user.comparePassword(password);
  
  if (!isPasswordCorrect) {
    throw new AppError('Invalid credentials', 401);
  }
  
  // Generate token
  const token = generateToken(user._id);
  
  // Remove password from response
  user.password = undefined;
  
  logger.info(`User logged in: ${user.email}`);
  
  res.status(200).json({
    success: true,
    token,
    user: {
      id: user._id,
      username: user.username,
      email: user.email
    }
  });
});

export const logout = asyncHandler(async (req, res, next) => {
  logger.info(`User logged out: ${req.user.email}`);
  
  res.status(200).json({
    success: true,
    message: 'Logged out successfully'
  });
});

export const getProfile = asyncHandler(async (req, res, next) => {
  const user = await User.findById(req.user._id);
  
  res.status(200).json({
    success: true,
    user: {
      id: user._id,
      username: user.username,
      email: user.email,
      createdAt: user.createdAt
    }
  });
});