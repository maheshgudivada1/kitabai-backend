const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');
const moment = require('moment');  // Import moment.js to handle date formatting

// File Schema
const fileSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,  // Name of the file is required
  },
  type: {
    type: String,
    required: true,  // File type (e.g., image/jpeg) is required
  },
  url: {
    type: String,
    required: true,  // File URL from S3 is required
  },
  date: {
    type: Date,  // Date of file upload is required
    required: true,
    default: Date.now,
  },
  sNo: {
    type: String,
    required: true,  // Serial number is required
  }
});

// Folder Schema
const folderSchema = new mongoose.Schema({
  _id: {
    type: String,
    default: uuidv4,  // Generate a UUID if not provided
    required: true,
  },
  folderName: {
    type: String,
    required: true,  // Folder name is required
  },
  folderType: {
    type: String,
    required: true,  // Folder type is required
  },
  folderCategory: {
    type: String,
    required: true,  // Folder category is required
  },
  folderSno: {
    type: String,
    required: true,  // Serial number is required
  },
  files: [fileSchema],  // Array of files in the folder
}, { timestamps: true });  // Automatically adds `createdAt` and `updatedAt` timestamps

// Create the Folder model from the schema
const Folder = mongoose.model('Folder', folderSchema);

// Example function to create a new folder and add files
const createFolderWithFiles = async () => {
  try {
    const folderData = {
      folderName: 'Project Files',
      folderType: 'Document',
      folderCategory: 'Work',
      folderSno: '12345',
      files: [
        {
          name: 'example.pdf',
          type: 'application/pdf',
          url: 'https://example.com/file.pdf',
          // Convert the date string "24/01/2025 12:36:19" to a valid Date object using moment.js
          date: moment('24/01/2025 12:36:19', 'DD/MM/YYYY HH:mm:ss').toDate(),
          sNo: '1'
        },
        {
          name: 'example2.png',
          type: 'image/png',
          url: 'https://example.com/image.png',
          // Another date conversion
          date: moment('23/01/2025 09:20:15', 'DD/MM/YYYY HH:mm:ss').toDate(),
          sNo: '2'
        }
      ]
    };

    // Create a new Folder with the data
    const newFolder = new Folder(folderData);

    // Save the folder to the database
    await newFolder.save();
    console.log('Folder and files saved successfully!');
  } catch (error) {
    console.error('Error creating folder with files:', error);
  }
};

// Connect to MongoDB and run the example function


module.exports = Folder;
