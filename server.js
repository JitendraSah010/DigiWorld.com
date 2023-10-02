require('dotenv').config();
const express = require('express');
const ejs = require('ejs');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const session = require('express-session');
const mongoDbSession = require('connect-mongodb-session')(session);
const bcrypt = require('bcrypt');
const cors = require('cors');                     //to fetch api data in react server from node js server
const multer = require('multer');                 // to upload file or image on mongodb
const path = require('path');                     //path of file to be upload
const flash = require('connect-flash');

const app = express();
app.set('view engine', 'ejs');
app.use(express.static('public')); 
app.use(bodyParser.urlencoded({extended:true}));
app.use(cors());
app.use(flash());

// imports
const router = require('./routes')                   //importing routes
const Users = require('./model/Users')              //importing User model  (model name is Users.model name is defined here)
const callback = require('./model/Callbacks')       //importing callback model
const product = require('./model/products');        //importing product model
const Payment = require('./model/Payments');        //importing payment model  (file name is "Payment.ejs" so we imported that file by its name Payment.no need to write .ejs)


mongoose.connect(process.env.SECRET_KEY).then( ()=>{
    // console.log("mongoDB is connected")
} )
const store = new mongoDbSession({
    uri: process.env.SECRET_KEY,
    collection : 'Sass-session',
})
// setup sessions
app.use(session({
    secret: process.env.PAS_SECRET_KEY,
    resave: false,
    saveUninitialized: false,
    store: store
}))

// route start
app.use('/', router);                    //defining routes here in sinple manner
app.use('/request-callback', router);
app.use('/callbacks', router);
app.post('/update-callback', router);
app.use('/login', router);
app.use('/auth', router);
app.use('/register', router);
app.use('/register-user', router);
app.use('/api-callbacks', router);              //API routes (Creating API)

//Create  & update product by admin 
app.use('/admin/create-product', router);
app.use('/admin/edit-product', router);
app.post('/admin/update-product', router);
app.post('/store-updated-product', router);
app.post('/delete-product', router);


app.use('/allProducts', router);
app.use('/checkout', router);                //payment checkout page
app.use('/payment-success', router);
app.use('/paid-users', router);
app.use('/deliveryOrders', router);
app.post('/update-deliveryStatus', router);
app.post('/store-updated-DeliveryStatus', router);
app.post('/cancelOrder', router);
app.use('/store-product', router);
app.use('/edit-product', router);
app.use('/update-product', router);
app.use('/active-service', router);
app.post('/logout', router);
app.use('/users', router);
app.post('/delete-user', router);
app.post('/delete-unverified-user', router);
// profile page routes
app.use('/profile', router);
app.post('/update-profile', router);
app.use('/updateImg', router);

app.use('/cart', router);
app.post('/addCart', router);
app.post('/deleteCartItem', router);
app.post('/CashDelivery', router);
app.post('/storeDeliveryOrder', router);
app.use('/myOrders', router);
// online payment paid delivery status update
app.post('/update-paidDeliveryStatus', router);
app.post('/paidOrderCancel', router);

// email verify
app.post('/verify', router);
app.post('/resend-otp', router);

// forgot password
app.use('/forgot-password', router);
app.post('/SendResetLink', router);
app.use('/reset-password/:token', router);

app.use('*', router);

const port = process.env.PORT || 3000;

app.listen(port, ()=>{
    // console.log("server is running on port 3000");
})