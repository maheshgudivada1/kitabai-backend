const mongoose = require('mongoose');

// Define the Book schema
const bookSchema = new mongoose.Schema({
  title: { type: String, required: true },               // Book Title
  category: { type: String, required: true },            // Book Category
  coverUrl: { type: String, required: true },            // Book Cover Page
  starRating: { type: Number, required: true, min: 0, max: 5 }, // Star Rating (between 0 and 5)
  totalPage: { type: Number, required: true },           // Total number of pages
  description: { type: String, required: true },         // Description of the book
  reviews: { type: [String], default: [] },              // Array of review comments
  MRP: { type: Number, required: true },                 // Maximum Retail Price (MRP)
  discount: { type: Number, default: 0 },                // Discount percentage
  discountedPrice: { type: Number, required: true },     // Discounted price after applying discount
  author: { type: String, required: true },              // Author of the book
  publisher: { type: String, required: true },           // Publisher of the book
  isbn: { type: String, required: true },                // ISBN number
  popularity: {                                          // Popularity: Low / Medium / High
    type: String, 
    enum: ['Low', 'Medium', 'High'], 
    required: true 
  },
}, { timestamps: true });  // Adds createdAt and updatedAt fields automatically

// Create the Book model
const Book = mongoose.model('Book', bookSchema);

// Export the Book model using named export
module.exports = { Book };