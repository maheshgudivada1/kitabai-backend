const express = require("express");
const dotenv = require("dotenv");
const mongoose = require('mongoose');
const AWS = require('aws-sdk');
const moment = require('moment');  // Import moment.js to handle date formatting
const fs = require('fs');
const QRCode = require('qrcode');

const { v4: uuidv4 } = require('uuid'); // Import uuidv4
const validator = require('validator');
const Folder = require('./models/folder');
const bodyParser = require('body-parser');

const { Book } = require('./models/book');  // Adjust the path based on your folder structure
const multer = require('multer');

const { MongoClient, ObjectId } = require("mongodb"); //npm install mongodb
const upload = multer({ dest: 'uploads/' });
const app = express();

app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({
    limit: '50mb',
    extended: true
}));

app.use(express.json());
dotenv.config();


app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content-Type, Accept, Authorization"
  );
  if (req.method === "OPTIONS") {
    res.header("Access-Control-Allow-Methods", "PUT, POST, PATCH, DELETE, GET");
    return res.status(200).json({});
  }
  next();
});




const uri = process.env.mongo_uri;
const client = new MongoClient(uri);


const dbname = "test";
const collection_name = "users";
let usersCollection;
let adminsCollection;
let subadminsCollection;

let result = "UnSuccessful";
app.use(bodyParser.urlencoded({ extended: true }));



const connectToDatabase = async () => {
  try {
    await client.connect();
    console.log(`Connected to the ${dbname} database`);
    usersCollection = client.db(dbname).collection(collection_name);
    adminsCollection = client.db(dbname).collection("admins");
    subadminsCollection = client.db(dbname).collection("subadmins");
    result = "Successful";
  } catch (err) {
    console.error(`Error connecting to the database: ${err}`);
    throw err; // Consider throwing the error to handle it properly where it's used
  }
};


const DB_URI = process.env.DB_URI; // Use environment variables for security

mongoose.connect(DB_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.error('Error connecting to MongoDB:', err));

// Function to close the database connection
app.post("/checkadmin", async (req, res) => {
  try {
    const user = await adminsCollection.findOne({ email: req.body.email });
    if (user) {
      res.status(200).json({ user, exist: true });
    } else {
      res.status(200).json({ exist: false, message: 'User not found' });
    }
  } catch (err) {
    res.status(500).json({ message: 'Error fetching user', error: err });
  }
});

app.post("/checksubadmin", async (req, res) => {
  try {
    const user = await subadminsCollection.findOne({ email: req.body.email });
    if (user) {
      res.status(200).json({ user, exist: true });
    } else {
      res.status(200).json({ exist: false, message: 'User not found' });
    }
  } catch (err) {
    res.status(500).json({ message: 'Error fetching user', error: err });
  }
});


app.use(async (req, res, next) => {
  if (!client) {
    try {
      await connectToDatabase();
    } catch (err) {
      return res.status(500).json({ message: "Internal Server Error: Failed to connect to the database" });
    }
  }
  next();
});




const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION,
});


// Function to upload folder metadata to S3
// Upload folder metadata to S3
const uploadToS3aws = async (folderName, category) => {
  const s3 = new AWS.S3();

  const params = {
    Bucket: process.env.AWS_S3_BUCKET_NAME,
    Key: `${folderName}/${category}/`, // Creating a folder in S3
    Body: '', // Empty body for folder creation
  };

  try {
    await s3.putObject(params).promise();
    return { success: true };
  } catch (error) {
    console.error(`S3 Upload Error: ${error.message}`);
    return { success: false, error: error.message };
  }
};


const updateMongoDB = async (folderName, category, type) => {
  try {
    const newFolder = new Folder({
      _id: uuidv4(),
      folderName,
      folderCategory: category,  // Add folderCategory field
      folderType: type,          // Add folderType field
      folderSno: new Date().getTime(),
      files: [],
    });

    await newFolder.save(); // Save folder details in MongoDB
    return { success: true };
  } catch (error) {
    console.error(`MongoDB Save Error: ${error.message}`);
    return { success: false, error: error.message };
  }
};








// Express routes to handle API requests
app.post('/uploadfolder', async (req, res) => {
  const { folderName, category, folderType } = req.body;  // Get folderType as well

  try {
    console.log('Received folder creation request:', { folderName, category, folderType });

    // Upload folder metadata to S3
    const result = await uploadToS3aws(folderName, category);

    if (result.success) {
      console.log('Folder uploaded to S3 successfully.');

      // After successful S3 upload, store metadata in MongoDB
      const mongoResult = await updateMongoDB(folderName, category, folderType); // Pass folderType

      if (mongoResult.success) {
        console.log('Folder metadata saved to MongoDB successfully.');
        res.status(200).json({ success: true });
      } else {
        console.error('Error saving to MongoDB:', mongoResult.error);
        res.status(500).json({ success: false, error: mongoResult.error });
      }
    } else {
      console.error('Error uploading to S3:', result.error);
      res.status(500).json({ success: false, error: result.error });
    }
  } catch (error) {
    console.error('Error creating folder:', error);
    res.status(500).json({ success: false, error: 'Internal Server Error' });
  }
});




app.post('/uploadfile', async (req, res) => {
  const { folderName, fileDetails, fileUrl } = req.body;

  try {
    let folder = await Folder.findOne({ folderName });
    if (!folder) {
      return res.status(404).json({ success: false, message: 'Folder not found' });
    }

    // Convert the date string into a Date object using moment.js
    const formattedDate = moment(fileDetails.date, 'DD/MM/YYYY HH:mm:ss').toDate();

    const newFile = {
      name: fileDetails.details,
      type: fileDetails.type,
      date: formattedDate,  // Use the formatted date here
      sNo: fileDetails.sNo,
      url: fileUrl,
      createdAt: new Date().toLocaleString(),
    };

    folder.files.push(newFile);
    await folder.save();

    res.status(200).json({ success: true });
  } catch (err) {
    console.error('Error uploading file metadata:', err);
    res.status(500).json({ success: false, message: 'Error uploading file metadata' });
  }
});

// POST: Get pre-signed URL for file upload to S3
app.post('/getpresignedurl', async (req, res) => {
  const { folderName, fileName } = req.body;
  try {
    const params = {
      Bucket: process.env.AWS_S3_BUCKET_NAME,
      Key: `${folderName}/${fileName}`,
      Expires: 60 * 5, // URL expires in 5 minutes
    };
    const url = s3.getSignedUrl('putObject', params);
    res.json({ success: true, url });
  } catch (error) {
    console.error('Error generating presigned URL:', error);
    res.json({ success: false, message: 'Failed to generate presigned URL' });
  }
});





// Express route to handle API request to list folders and files from S3
app.get('/list-folders-files', async (req, res) => {
  try {
    const folders = await Folder.find({}); // Fetch all folders from MongoDB

    // For each folder, fetch pre-signed URLs for the files
    for (const folder of folders) {
      for (const file of folder.files) {
        const fileParams = {
          Bucket: process.env.AWS_S3_BUCKET_NAME,
          Key: `${folder.folderName}/${file.name}`,
          Expires: 3600, // Pre-signed URL expires in 1 hour
        };
        file.url = s3.getSignedUrl('getObject', fileParams);
      }
    }

    res.json({
      success: true,
      folders,
    });
  } catch (error) {
    console.error('Error fetching folders and files:', error);
    res.status(500).json({ success: false, message: 'Error fetching folders and files' });
  }
});




app.delete('/deletefolder', async (req, res) => {
  const { folderId } = req.query;

  console.log('Received request to delete folder:', folderId);

  // Validate folderId as UUID
  if (!validator.isUUID(folderId)) {
    console.log(`Invalid folderId: ${folderId}`);
    return res.status(400).send('Invalid UUID for folderId');
  }

  try {
    // Query for the folder with the specified folderId
    const folder = await Folder.findById(folderId);

    if (!folder) {
      console.log('Folder not found');
      return res.status(404).send('Folder not found');
    }

    // 1. Delete Files from AWS S3
    const s3Promises = folder.files.map(async (file) => {
      const params = {
        Bucket: 'kitabai-file-uploads',  // Replace with your bucket name
        Key: file.s3Key  // Assume that file.s3Key is the path of the file in the S3 bucket
      };

      try {
        await s3.deleteObject(params).promise();
        console.log(`File ${file.s3Key} deleted from S3`);
      } catch (error) {
        console.error('Error deleting file from S3:', error);
      }
    });

    // Wait for all S3 delete promises to resolve
    await Promise.all(s3Promises);

    // 2. Delete the Folder from MongoDB using deleteOne() or delete()
    await folder.deleteOne();  // Use deleteOne() instead of remove()
    console.log(`Folder ${folderId} deleted successfully`);

    res.status(200).send(`Folder and files deleted successfully`);
  } catch (error) {
    console.error('Error deleting folder:', error);
    res.status(500).send('Error deleting folder and files');
  }
});



app.delete('/deletefile', async (req, res) => {
  const { folderId, fileId, fileName } = req.query;

  console.log('Received request to delete file:', fileName);
  console.log('Received folderId:', folderId);
  console.log('Received fileId:', fileId);

  // Validate folderId as UUID and fileId as string (for non-ObjectId storage)
  if (!validator.isUUID(folderId)) {
    console.log(`Invalid folderId: ${folderId}`);
    return res.status(400).send('Invalid UUID for folderId');
  }

  // Check if fileId is a valid string (since it's being stored as a string)
  if (!fileId) {
    console.log(`Invalid fileId: ${fileId}`);
    return res.status(400).send('Invalid fileId');
  }

  try {
    // Query for the folder with the specified folderId and the fileId in the 'files' array
    console.log(`Querying for file with folderId: ${folderId} and fileId: ${fileId}`);

    const folder = await Folder.findOne({
      _id: folderId, 
      'files._id': fileId  // Correct query for nested file ID in the array
    });

    console.log('Folder found:', folder);

    if (!folder) {
      console.log('File not found');
      return res.status(404).send('File not found');
    }

    // Now that the file is found, remove it from the 'files' array
    const fileIndex = folder.files.findIndex(file => file._id.toString() === fileId);
    if (fileIndex !== -1) {
      // Remove the file from the array
      folder.files.splice(fileIndex, 1);
      await folder.save(); // Save the updated folder document

      // If you are deleting from storage (e.g., AWS S3), handle it here as well
      console.log(`File ${fileName} deleted from folder ${folderId}`);

      res.status(200).send(`File ${fileName} deleted successfully`);
    } else {
      console.log('File not found in folder');
      res.status(404).send('File not found in folder');
    }
  } catch (error) {
    console.error('Error deleting file:', error);
    res.status(500).send('Error deleting file');
  }
});

app.get('/getbooks', async (req, res) => {
  try {
    const books = await Book.find(); // Retrieve all books from the database
    res.status(200).json(books); // Send the books as a JSON response
  } catch (error) {
    console.error('Error retrieving books:', error);
    res.status(500).json({ error: 'Error retrieving books' });
  }
});

app.get('/getbook/:isbn', async (req, res) => {
  try {
    // Find the book in the database using the ISBN number from the URL
    const book = await Book.findOne({ isbn: req.params.isbn });

    if (!book) {
      return res.status(404).send('Book not found');
    }

    // Send an HTML page that displays the book details
    res.send(`
      <html>
        <head>
          <title>${book.title}</title>
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
            body {
              font-family: Arial, sans-serif;
              margin: 20px;
              background-color: #f9f9f9;
            }
            .container {
              max-width: 800px;
              margin: 0 auto;
              padding: 20px;
              border: 1px solid #ddd;
              border-radius: 10px;
              background-color: #fff;
            }
            .cover-image {
              max-width: 100%;
              height: auto;
              display: block;
              margin-bottom: 20px;
            }
            .title {
              font-size: 24px;
              font-weight: bold;
              margin-bottom: 10px;
            }
            .details {
              font-size: 18px;
              margin-bottom: 20px;
            }
            .description {
              font-size: 16px;
              margin-bottom: 20px;
            }
            .reviews {
              font-size: 14px;
              color: #666;
            }
            .buttons {
              display: flex;
              justify-content: space-between;
              margin-top: 30px;
            }
            .button {
              background-color: #4CAF50;
              color: white;
              padding: 10px 20px;
              text-align: center;
              text-decoration: none;
              border-radius: 5px;
              cursor: pointer;
              font-size: 16px;
              margin-right:20px;

            }
            .button:hover {
              background-color: #45a049;
            }
            @media only screen and (max-width: 768px) {
              .container {
                width: 100%;
                padding: 15px;
                border: none;
                margin: 0;
              }
              .title {
                font-size: 20px;
              }
              .details {
                font-size: 16px;
              }
              .description {
                font-size: 14px;
              }
            }
            @media only screen and (max-width: 480px) {
              .container {
                padding: 10px;
              }
              .title {
                font-size: 18px;
              }
              .details {
                font-size: 14px;
              }
              .description {
                font-size: 12px;
              }
              .button{
                font-size:15px;
              }
            }
          </style>
        </head>
        <body>
          <div class="container">
            <img class="cover-image" src="${book.coverUrl}" alt="Book Cover">
            <div class="title">${book.title}</div>
            <div class="details">
              <p><strong>Author:</strong> ${book.author}</p>
              <p><strong>Category:</strong> ${book.category}</p>
              <p><strong>Publisher:</strong> ${book.publisher}</p>
              <p><strong>Total Pages:</strong> ${book.totalPage}</p>
              <p><strong>MRP:</strong> ₹${book.MRP}</p>
              <p><strong>Discounted Price:</strong> ₹${book.discountedPrice}</p>
              <p><strong>Rating:</strong> ${book.starRating} / 5</p>
              <p><strong>Popularity:</strong> ${book.popularity}</p>
            </div>
            <div class="description">${book.description}</div>
            <div class="reviews"><strong>Reviews:</strong> ${book.reviews.join(', ')}</div>

            <div class="buttons">
              <!-- Button to download KitabAi app from Play Store -->
              <a href="https://play.google.com/store/search?q=KitabAI&c=apps" class="button" target="_blank">Download KitabAi App</a>

              <!-- Button to navigate to the main site -->
              <a href="https://kitabai.in" class="button" target="_blank">Go to Main Site</a>
            </div>
          </div>
        </body>
      </html>
    `);
  } catch (err) {
    console.error('Error fetching book data:', err.message);
    res.status(500).send('Server Error');
  }
});





app.post('/uploadbooks', async (req, res) => {
  try {
    console.log('Received data from frontend:', req.body);

    // Generate QR code for the book (use book's title or any unique identifier)
    const bookUrl = `https://kitabai-books.onrender.com/getbook/${req.body.isbnNumber}`;
    const qrCodeUrl = await QRCode.toDataURL(bookUrl);

    // Create a new book instance using the request body data
    const newBook = new Book({
      title: req.body.title,
      category: req.body.category,
      coverUrl: req.body.coverPageUrl,
      starRating: req.body.startRating,
      totalPage: req.body.totalPages,
      description: req.body.description,
      reviews: req.body.reviews || [],
      MRP: req.body.mrp,
      discount: req.body.discount || 0,
      discountedPrice: req.body.discountedPrice,
      author: req.body.author,
      publisher: req.body.publisher,
      isbn: req.body.isbnNumber,
      popularity: req.body.popularity,
      qrCodeUrl, // Store the QR code URL
    });

    // Save the book to the database
    const savedBook = await newBook.save();
    res.status(201).json({ message: 'Book added successfully!', book: savedBook });
    console.log('Book uploaded successfully, QR code generated and stored.');
  } catch (err) {
    console.error('Error uploading book metadata:', err.message);
    res.status(400).json({ error: err.message });
  }
});



app.post('/coverpagepresignedurl', async (req, res) => {
  const { folderName, fileName } = req.body;
  console.log(folderName, fileName);

  const params = {
    Bucket: process.env.AWS_S3_BUCKET_NAME,
    Key: `${folderName}/${fileName}`,
    Expires: 60, // URL expiry time in seconds
  };

  try {
    const url = await s3.getSignedUrlPromise('putObject', params);
    res.status(200).json({ url });
  } catch (err) {
    console.error('Error generating presigned URL:', err);
    res.status(500).json({ error: 'Error generating presigned URL' });
  }
});

// Endpoint to update a book
app.put('/updatebook/:id', async (req, res) => {
  try {
    // Log the incoming data from frontend
    console.log('Received data from frontend:', req.body);

    // Find the book by ID
    const bookId = req.params.id;
    const book = await Book.findById(bookId);

    if (!book) {
      return res.status(404).json({ error: 'Book not found' });
    }

    // Update book fields with the request body data
    book.title = req.body.title;
    book.category = req.body.category;
    book.coverUrl = req.body.coverPageUrl;  // Ensure this is updated
    book.starRating = req.body.startRating;
    book.totalPage = req.body.totalPages;
    book.description = req.body.description;
    book.reviews = req.body.reviews || [];
    book.MRP = req.body.mrp;
    book.discount = req.body.discount || 0;
    book.discountedPrice = req.body.discountedPrice;
    book.author = req.body.author;
    book.publisher = req.body.publisher;
    book.isbn = req.body.isbnNumber;
    book.popularity = req.body.popularity;

    // Save the updated book to the database
    const updatedBook = await book.save();
    res.status(200).json({ message: 'Book updated successfully!', book: updatedBook });
    console.log("Book updated successfully");
  } catch (err) {
    // Handle validation errors and send a friendly error message
    console.error('Error updating book metadata:', err.message);
    res.status(400).json({ error: err.message });
  }
});

app.delete('/deletebook/:id', async (req, res) => {
  try {
    const bookId = req.params.id;
    const deletedBook = await Book.findByIdAndDelete(bookId);

    if (!deletedBook) {
      return res.status(404).json({ error: 'Book not found' });
    }

    res.status(200).json({ message: 'Book deleted successfully', deletedBook });
    console.log("Book deleted successfully");
  } catch (err) {
    console.error('Error deleting book:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post('/getpresignedurlFiles', async (req, res) => {
  const { folderName, fileName } = req.body;
  try {
    const params = {
      Bucket: process.env.AWS_S3_BUCKET_NAME,
      Key: `${folderName}/${fileName}`,
      Expires: 60 * 5, // URL expires in 5 minutes
    };
    const url = s3.getSignedUrl('putObject', params);
    res.json({ success: true, url });
  } catch (error) {
    console.error('Error generating presigned URL:', error);
    res.json({ success: false, message: 'Failed to generate presigned URL' });
  }
});

app.post('/addFilesToBook', async (req, res) => {
  const { bookId, files } = req.body;
  console.log(bookId, files);

  try {
    let book = await Book.findById(bookId);
    if (!book) {
      return res.status(404).json({ success: false, message: 'Book not found' });
    }

    const newFiles = [];

    for (const file of files) {
      // Generate pre-signed URL for the file
      const presignedUrlResponse = await fetch(`http://localhost:3001/getpresignedurlFiles`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          folderName: bookId, // Use bookId as the folder name
          fileName: file.details,
        }),
      });

      const presignedUrlData = await presignedUrlResponse.json();
      if (!presignedUrlData.success) {
        throw new Error('Failed to generate presigned URL');
      }

      const presignedUrl = presignedUrlData.url;

      // Convert the base64 string to a buffer
      const fileData = Buffer.from(file.data, 'base64');

      // Upload the file to S3 using the pre-signed URL
      const uploadResponse = await fetch(presignedUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': file.type,
        },
        body: fileData,
      });

      if (!uploadResponse.ok) {
        throw new Error('Failed to upload file to S3');
      }

      // Convert the date string into a Date object
      const formattedDate = new Date(file.date);

      newFiles.push({
        name: file.details,
        type: file.type,
        date: formattedDate, // Use the formatted date here
        sNo: file.sNo,
        url: presignedUrl, // Store the S3 URL
        createdAt: new Date().toLocaleString(),
      });
    }

    book.files = book.files.concat(newFiles); // Assuming 'files' is an array in the Book schema
    await book.save();

    res.status(200).json({ success: true, message: 'Files added successfully' });
  } catch (err) {
    console.error('Error adding files to book:', err);
    res.status(500).json({ success: false, message: 'Error adding files to book' });
  }
});




connectToDatabase()
  .then(() => {
    app.listen(3001, () => {
      console.log(`Server is running on port ${3001}`);
    });
  })
  .catch((err) => {
    console.error("Failed to start the server:", err);
  });



