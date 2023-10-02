const express = require('express');
const ObjectId = require('mongodb').ObjectId;     //getting objectId on mongoDb
const Callbacks = require('./model/Callbacks');
const Users = require('./model/Users');
const router = express.Router();        //to route from one to another page
const bcrypt = require('bcrypt');
const Products = require('./model/products');
const CartItems = require('./model/cart');
const Payment = require('./model/Payments')
const bodyParser = require('body-parser');
const CryptoJS = require('crypto-js');
const multer = require('multer');                 // to upload file or image on mongodb
const path = require('path');                     //path of file to be upload
const DeliveryOrder = require('./model/DeliveryOrders');
const flash = require('connect-flash');
const nodemailer = require('nodemailer');
const crypto = require('crypto');

router.use(bodyParser.urlencoded({extended:true}))
router.use(express.static('public'));

// Razorpay payment gateway
const Razorpay = require('razorpay');
const products = require('./model/products');
const razorpay = new Razorpay({
    key_id: process.env.RAZOR_SECRET_ID,
    key_secret: process.env.RAZOR_SECRET_KEY,
})

// securing all pages
const isAdmin = (req, res, next)=>{
    if(req.session.isAdmin == true && req.session.loginUser.role == 1){
        next()
    }
    else{
        res.redirect('/login');
    }
}
// setting isAuth
const isAuth = (req, res, next)=>{
    if(req.session.isAuth == true){
        next()
    }
    else{
        res.redirect('/login');
    }
}

//  storage setup to Upload file or image  
const storage = multer.diskStorage({          //defined destination and filename of multer function file uploading 
    destination: "public",
    filename: (req, file, cb)=>{
        cb(null, file.fieldname+"_"+Date.now()+path.extname(file.originalname));
    }
 })
// multer function middleware
const upload = multer({ storage:storage}).single('profileImg');

// Nodemailer configuration
const transporter = nodemailer.createTransport({
    service: 'Gmail',
    auth: {
      user: process.env.EMAIL_ID,
      pass: process.env.EMAIL_PASSWORD,
    },
  });

router.get('/', isAuth, async (req,res)=>{                   //explaining the route
    const product = await Products.find({status:1})
    const loginUser = req.session.loginUser; 
    const profileImage = await Users.findOne({email: loginUser.email});
    res.render('index' , {fetchedProducts:product , loginUser:loginUser, profileImage:profileImage });
})

//------------------------------User functionality-----------------------
router.post('/request-callback', (req,res)=>{
    const {name,email,phone} = req.body;
    const callback = new Callbacks({
        name:name,
        email:email,
        phone:phone,
        date: new Date(),
    })
    callback.save();
    res.redirect('/');
})
// -------------------------------------Callback functionality--------------------------------
router.get('/callbacks', isAdmin, async(req,res)=>{
    const callbacks = await Callbacks.find().sort({date:"desc"});
    res.render('./admin/callbacks', {callbacks: callbacks})
})
// update callback
router.post('/update-callback', isAdmin, async(req,res)=>{
    const callback = await Callbacks.findOne({_id: new ObjectId(req.body.id)});
    res.render('./admin/UpdateCallback', {callback: callback});
})
// store-update-callback
router.post('/store-update-callback', isAdmin, async(req,res)=>{
    const data = await Callbacks.updateOne(
        {_id: new ObjectId(req.body.id)},
        {
            $set: {
                name: req.body.name,
                email: req.body.email,
                phone: req.body.phone,
                status: req.body.status,
                remarks: req.body.remarks
            }
        })
        res.redirect('/callbacks')
})
// ------------------------------Register -------------------------------------------
router.get('/register', (req,res)=>{
    res.render('register', {message: req.flash()});
})
router.post('/register-user', upload, async(req,res)=>{
    const {name, email, password, contact, address} = req.body;
    const now = new Date();

    const profileImg = req.file ? req.file.filename : 'login.png';
    const existingUser = await Users.findOne({email});
    if( !name || !email || !contact || !password || !contact ){
        req.flash("error", "Please fill all input fields");
        return res.redirect('/register');
    }
    else if(password.length < 8){
        req.flash("error", "Password must be atleast 8 characters");
        return res.redirect('/register');
    }else{

        if(existingUser){
            req.flash("error", "User already exists, enter new email");
            res.redirect('/register');
        }
        else{
              // Generate a verification code
            const verificationCode = crypto.randomBytes(3).toString('hex');
            // Calculate OTP expiration time (2 minutes from now)
            const otpExpiryTime = new Date(now.getTime() + 2 * 60 * 1000); // 2 minutes in milliseconds
            // console.log("Otp expiry time is",otpExpiryTime);

            const registeredUser = new Users({                  //bcrypt middleware
                name: name,
                email: email,
                contact: contact,
                address: address,
                profileImg: profileImg,
                password: await bcrypt.hash(password, 12),
                isVerified: false,
                verificationCode: verificationCode,
                otpExpiryAt: otpExpiryTime,
                lastOtpRequestAt: now
            })

            try {
                await registeredUser.save();
                // Send the verification email
                const mailOptions = {
                  from: process.env.EMAIL_ID,
                  to: email,
                  subject: 'Verify Your Email',
                  text: `Your verification code is: ${verificationCode} valid for 2 minutes only`,
                };

                transporter.sendMail(mailOptions, (error, info) => {
                  if (error) {
                    // console.error(error);
                    req.flash("error", "verification email not sent.");
                    res.redirect('/register');
                  }
                  req.flash("error", "User registered. Check your email for verification code.");
                  res.render('EmailVerify', {email:email, message: req.flash()});
                });
              } catch (error) {
                // console.error(error);
                res.status(500).json({ message: 'Registration failed' });
              }
        }
    }
})

router.post('/verify', async (req, res) => {
    const { verifyEmail, verificationCode } = req.body;
    const concatenatedOTP = verificationCode.join('');
    try {
      const user = await Users.findOne({email: verifyEmail });
      if (!user) {
        return res.status(400).json({ message: 'User not found' });
      }
      if (user.isVerified) {
        return res.status(400).json({ message: 'Email already verified' });
      }
      if ( !user.verificationCode || user.verificationCode !== concatenatedOTP) {
        return res.status(400).json({ message: 'Invalid verification code' });
      }
      const now = new Date();
      if (user.otpExpiryAt && now > user.otpExpiryAt) {
        return res.status(400).json({ message: 'Verification code has expired. please click on resend otp button' });
      }
      user.isVerified = true;
      await user.save();
      req.flash("error", "Email verified successfully.Login Now");
      res.redirect('/login')
    } catch (error) {
    //   console.error(error);
      res.status(500).json({ message: 'Email verification failed' });
    }
  });

//   Resend OTP
router.post('/resend-otp', async (req, res) => {
    const { verifyEmail } = req.body;
    try {
      const user = await Users.findOne({ email:verifyEmail });
      if (!user) {
        return res.status(400).json({ message: 'User not found' });
      }
      if (user.isVerified) {
        return res.status(400).json({ message: 'Email already verified' });
      }else{
      const now = new Date();           // formating date
      const otpExpiryTime = new Date(now.getTime() + 2 * 60 * 1000);
  
      if (!user.lastOtpRequestAt || (now - user.lastOtpRequestAt) >= 2 * 60 * 1000) {
        // Generate a new verification code
        const verificationCode = crypto.randomBytes(3).toString('hex');
        // Update the verification code and timestamp
        user.verificationCode = verificationCode;
        user.otpExpiryAt = otpExpiryTime;
        user.lastOtpRequestAt = now;
        await user.save();
        // Send the new verification email
        const mailOptions = {
          from: process.env.EMAIL_ID,
          to: verifyEmail,
          subject: 'Resend Verification Code',
          text: `Your new verification code is: ${verificationCode} valid for 2 minutes only`,
        };
  
        transporter.sendMail(mailOptions, (error, info) => {
          if (error) {
            // console.error(error);
            return res.status(500).json({ message: 'Email not sent' });
          }
          res.status(200).json({ message: 'New OTP sent successfully, Check your email' });
        });
      } else {
        res.status(400).json({ message: 'Current OTP is not expired, wait 2 minutes to resend new OTP' });
      }
    }
    } catch (error) {
    //   console.error(error);
      res.status(500).json({ message: 'OTP resend failed' })
    }
  });
  
// -------------------------------login functionality-------------------------------
router.get('/login', (req,res)=>{
    res.render('login', {message: req.flash()});
})
router.post('/auth', async(req,res)=>{
    const {email, password} = req.body;
    const loginUser = await Users.findOne({email});
    if( !email || !password){
        req.flash("error", "Enter email or password");
        return res.redirect('/login');
    }else{
    if(loginUser){
        const isPasswordValid = await bcrypt.compare(password, loginUser.password)
        if(isPasswordValid && loginUser.isVerified == true){
            req.session.isAuth = true;
            req.session.loginUser = loginUser;            //user details are passed inside loginUser variable
            const product = await Products.find({status:1})          //product are fetched to display this product on " Frequently Ordered "
            const profileImage = await Users.findOne({email: loginUser.email});
            
            if(loginUser.role == 0){
                res.render('index', {fetchedProducts:product, loginUser:loginUser, profileImage:profileImage} )
            }
            else{
                req.session.isAdmin = true;
                res.redirect('/admin/AdminDashboard');
            }
        }
         else if(loginUser.isVerified == false){
            req.flash("error", "Email isn't verified.Please verify, click on resend button to get OTP.");
            res.render('EmailVerify',{email:email, message: req.flash()});
        }
        else{
            req.flash("error", "Wrong Password! Enter correct password");
            return res.redirect('/login');
            // return res.status(406).json({message: "Wrong Password!"});
        }
    }
    else{
        req.flash("error", "User doesn't exists! SignUp first ");
        return res.redirect('/login');
        // return res.status(406).json({message: "User Doesn't exists!"});
    }
}
})
// -------------------------------forgot password functionality----------------
router.get('/forgot-password', (req,res)=>{
    res.render('forgotPassword',{message: req.flash()});
});
router.post('/SendResetLink', async(req,res)=>{
        const email = req.body.email;
        try {
          const user = await Users.findOne({email:email});
          if (!user) {
            req.flash("error", "User not found");
            return res.redirect('/forgot-password');
          }
          if(user.isVerified == true){
          // Generate a password reset token and expiration time
          const resetToken = crypto.randomBytes(20).toString('hex');
          const resetTokenExpiry = new Date(Date.now() + 5000); // Token expires in 1 hour
          // Store the reset token and its expiration time in the user's document
          user.resetPasswordToken = resetToken;
          user.resetPasswordExpires = resetTokenExpiry;
          await user.save();
          // Send an email with a link to reset the password
          const resetLink = `${req.protocol}://${req.get('host')}/reset-password/${resetToken}`;
          const mailOptions = {
            from: process.env.EMAIL_ID,
            to: email,
            subject: 'Password Reset',
            text: `You are receiving this because you (or someone else) have requested the reset of the password for your account.\n`
                  + `Please click on the following link to reset your password:\n${resetLink}\n`
                  + `This link is valid for 5 minutes only\n`
                  + `If you did not request this, please ignore this email and your password will remain unchanged.`,
          }
          transporter.sendMail(mailOptions, (error, info) => {
            if (error) {
            //   console.error(error);
              req.flash("error", "Password reset email not sent.");
              return res.redirect('/forgot-password');
            }
            // console.log('Password reset email sent: ' + info.response);
            req.flash("success", "Password reset email sent. Reset then login.");
            res.redirect('/login');
          })
          }
          else{
            req.flash("error", "Email isnot verified. Verify then reset.");
            res.redirect('/forgot-password');
          } 
          
        } catch (error) {
        //   console.error(error);
          req.flash("error", "Password reset failed.");
          res.redirect('/forgot-password');
        }
})
// password reset route when user click on email link
router.get('/reset-password/:token', async(req,res) => {
    const { token } = req.params;
    try {
      // Finding the user with the matching reset token and check if it is not expired
      const user = await Users.findOne({
        resetPasswordToken: token,
        resetPasswordExpires: { $gt: Date.now() },
      });
      if (!user) {
        req.flash("error", "Password reset token is invalid or used or expired.");
        return res.redirect('/login');
      }
      // Render a password reset form with a new password input
      res.render('reset-password', { token });
    } catch (error) {
    //   console.error(error);
      req.flash("error", "Password reset failed.");
      res.redirect('/login');
    }
  });
//   update the password when user submit the password reset form
router.post('/reset-password/:token', async (req, res) => {
    const { token } = req.params;
    const password  = req.body.password;
        try {
        // Finding the user with the matching reset token and check if it is not expired
        const user = await Users.findOne({
            resetPasswordToken: token,
            resetPasswordExpires: { $gt: Date.now() },
        });
        if (!user) {
            req.flash("error", "Password reset token is invalid or has expired.");
            return res.redirect('/login');
        }
        // Update the user's password and clear the reset token fields
        user.password = await bcrypt.hash(password, 12);
        user.resetPasswordToken = undefined;
        user.resetPasswordExpires = undefined;
        await user.save();
        req.flash("success", "Password reset successfully. You can now log in with your new password.");
        res.redirect('/login');
        } catch (error) {
        // console.error(error);
        req.flash("error", "Password reset failed.");
        res.redirect('/login');
        }
  });
//--------------------------------Admin Dashboard functionality----------------
router.get('/admin/AdminDashboard', isAdmin, async(req,res)=>{
    // Cash on delivery details
    const Total = await DeliveryOrder.find();
    const Remaining = await DeliveryOrder.find({deliveryStatus: 0});
    const Delivered = await DeliveryOrder.find({deliveryStatus: 1});
    const Cancelled = await DeliveryOrder.find({deliveryStatus: 2});
    // paid Orders delivery detail
    const paidTotal = await Payment.find();
    const paidRemaining = await Payment.find({deliveryStatus: 0});
    const paidDelivered = await Payment.find({deliveryStatus: 1});
    const paidCancelled = await Payment.find({deliveryStatus: 2});
    const paidRefunded = await Payment.find({deliveryStatus: 3});

    const users = await Users.find();
    const callbacks = await Callbacks.find();
    const newLeads = await Callbacks.find({status:0});
    const followUps = await Callbacks.find({status:1});
    const paid = await Callbacks.find({status:2});
    const DispName = req.session.loginUser.name;

    res.render('admin/AdminDashboard', {
        Total:Total, Remaining:Remaining, Delivered:Delivered, Cancelled:Cancelled, 
        paidTotal:paidTotal, paidRemaining:paidRemaining, paidDelivered:paidDelivered, paidCancelled:paidCancelled, paidRefunded:paidRefunded, 
        users:users, callbacks:callbacks, newLeads:newLeads, followUps:followUps, paid:paid, DispName:DispName
    })
})
// ---------------------------------Create product------------------------------------
// AllProducts router
router.get('/AllProducts', isAuth, async(req,res)=>{
    const product = await Products.find({status:1})          //fetching the created products
    const profileImage = await Users.findOne({email: req.session.loginUser.email});
    res.render('allProducts', {fetchedProducts:product, profileImage:profileImage});
})
router.get('/admin/create-product', isAdmin, async(req,res)=>{
    res.render('./admin/AddProduct');
})
router.post('/store-product', isAdmin, async(req,res)=>{
    const {title, img, desc, pricing, status} = req.body;
    const Createproduct = new Products({
        title: title,
        img: img,
        desc: desc,
        pricing: pricing,
        status: status,
    })
    await Createproduct.save();
    res.redirect('/AllProducts');
})

// ---------------------------Edit Product -------------------------------
router.get('/admin/edit-product', isAdmin, async(req,res)=>{
    const EditProduct = await Products.find();
    res.render('./admin/EditProduct', {EditProduct: EditProduct});
})

// update product
router.post('/admin/update-product', isAdmin, async(req,res)=>{
    const UpdateProduct = await Products.findOne({_id: new ObjectId(req.body.id)});
    res.render('./admin/UpdateProduct', {UpdateProduct: UpdateProduct});
})
// store-update-product
router.post('/store-updated-product', isAdmin, async(req,res)=>{
    const data = await Products.updateOne(
        {_id: new ObjectId(req.body.id)},
        {
            $set: {
                title: req.body.title,
                img: req.body.img,
                desc: req.body.desc,
                pricing: req.body.pricing,
                status: req.body.status
            }
        })
        res.redirect('/admin/edit-product')
})
router.post('/delete-product', isAdmin, async(req, res)=>{
    const deleteProduct = await Products. deleteOne({_id: new ObjectId(req.body.id)});
    res.redirect('/admin/edit-product');
} )

// ----------------------------payment router--------------------------------
const razorpayKey = process.env.RAZOR_SECRET_ID;
router.get('/checkout', isAuth, async(req,res)=>{
    let productTitle = req.query.fetchedProduct;
    const productDetails = await products.findOne({title:productTitle});
    const profileImage = await Users.findOne({email: req.session.loginUser.email});

    const options = {
        amount: productDetails.pricing*100,
        currency: 'INR',
        receipt: 'order_receipt',
        payment_capture: 1,
    }
    razorpay.orders.create(options, (err, order)=>{
        if(err){
            console.log(err);
            return;
        }
        res.render('checkout', {order:order, productDetails: productDetails, loginUser:req.session.loginUser, profileImage:profileImage, razorpayKey:razorpayKey})
    })
})

router.post('/payment-success', async(req,res)=>{
    const response = await razorpay.payments.fetch(req.body.razorpay_payment_id)
    //saving payment details to display on payment page
    const now = new Date();
    const date = now.toLocaleDateString('en', {year: 'numeric', month: 'long', day: 'numeric'} ) + "(" + now.toLocaleTimeString('en', {hour :"2-digit", minute:"2-digit"}) +")" ;
    
    const paymentDetails = new Payment({
        email: response.email,
        phone: response.contact,
        payment_id: response.id,
        amount: response.amount,
        status: response.status,
        order_id: response.order_id,
        method: response.method,
        desc: response.description,
        date: date
    })
    paymentDetails.save();
    req.flash("error", "Order placed successfully! ");
    res.redirect('/myOrders');
})
// store-update-paidDeliveryStatus
router.post('/update-paidDeliveryStatus', isAdmin, async(req,res)=>{
    const paidDeliveryOrders = await Payment.findOne({_id: new ObjectId(req.body.id)});
    res.render('./admin/updatePaidDeliveryStatus', {paidDeliveryOrders: paidDeliveryOrders});
})
//store-updated-paidDeliveryStatus
router.post('/store-updated-paidDeliveryStatus', isAdmin, async(req,res)=>{
    if (req.body.deliveryStatus) {
        const now = new Date();           // formating date
        const date = now.toLocaleDateString('en', {year: 'numeric', month: 'long', day: 'numeric'} ) + "(" + now.toLocaleTimeString('en', {hour :"2-digit", minute:"2-digit"}) +")" ;    
        // Only update the delivery date if it's status is changed to 1
        const data = await Payment.updateOne(
            {_id: new ObjectId(req.body.id)},
            {
                $set: {
                    deliveryStatus: req.body.deliveryStatus,
                    date: date
                }
            })
            res.redirect('/paid-users');
    }
})
//canceling paid order by user
router.post('/paidOrderCancel', isAuth, async(req,res)=>{
    const now = new Date();           // formating date
    const date = now.toLocaleDateString('en', {year: 'numeric', month: 'long', day: 'numeric'} ) + "(" + now.toLocaleTimeString('en', {hour :"2-digit", minute:"2-digit"}) +")" ;
    req.flash("error", "Order Cancelled. Refunding soon ");

    const data = await Payment.updateOne(
        {_id: new ObjectId(req.body.productId)},
        {
            $set: {
                deliveryStatus:2,
                date: date
            }
        })
        res.redirect('/myOrders');
})
//fetching paid users on admin page
router.get('/paid-users', isAdmin, async(req,res)=>{
    const paidUsers = await Payment.find().sort({date: -1});
    res.render('admin/payments', {paidUsers: paidUsers})
})

// ------------------------------users list on admin page------------------------
router.get('/users', isAdmin, async (req,res)=>{
    const usersOnAdminPage = await Users.find();
    const UnverifiedusersOnAdminPage = await Users.find({isVerified: false});
    res.render('admin/users', {usersOnAdminPage: usersOnAdminPage, UnverifiedusersOnAdminPage:UnverifiedusersOnAdminPage});
})

// ---------------------------delete user by admin -------------------------
router.post('/delete-user', isAdmin, async(req, res)=>{
    const deleteuser = await Users. deleteOne({email: req.body.email});
    const delcallback = await Callbacks.deleteMany({email:req.body.email});
    const deleteCart = await CartItems.deleteMany({cartEmail:req.body.email});
    // const delPaymentDetails = await Payment.deleteMany({email: req.body.email});
    res.redirect('/users');
} )
router.post('/delete-unverified-user', async(req, res)=>{
    const deleteUnverifiedUsers = await Users.deleteMany({isVerified: false});
    // const delPaymentDetails = await Payment.deleteMany({email: req.body.email});
    res.redirect('/users');
} )

// ---------------------------------user profile functionality-----------------
router.get('/profile', isAuth, async(req,res)=>{
    const profileDetails = await Users.findOne({_id: req.session.loginUser._id}); //finding the database object id from session stored data. 
    const profileImage = await Users.findOne({email: req.session.loginUser.email});

    res.render('profile', {profileDetails:profileDetails, profileImage:profileImage, message:req.flash()})
})
//update profile
router.post('/update-profile', isAuth, async(req,res)=>{
    const profileDetails = await Users.findOne({_id: new ObjectId(req.body.id)});
    const profileImage = await Users.findOne({email: req.session.loginUser.email});
    res.render('updateProfile', {profileDetails: profileDetails, profileImage:profileImage });
})

router.post('/store-update-profile', isAuth, upload, async (req, res) => {
    const updateFields = {
        name: req.body.name,
        email: req.body.email,
        contact: req.body.contact,
        address:req.body.address
    };
    if (req.body.password) {
        // Only update the password if it's provided in the request
        updateFields.password = await bcrypt.hash(req.body.password, 12);
    }
    if(req.file){
        updateFields.profileImg = req.file.filename;
    }
    const data = await Users.updateOne(
        { _id: new ObjectId(req.body.id) },
        { $set: updateFields }
    );
    req.flash("error", "Profile is updated ");
    res.redirect('/profile');
});

router.get('/updateImg', isAuth, async (req,res)=>{
    const profileDetails = await Users.findOne({_id: req.session.loginUser._id}); 
    const profileImage = await Users.findOne({email: req.session.loginUser.email});
    
    res.render('updateProfile', {profileDetails: profileDetails, profileImage:profileImage} );
})

// ----------------------------------Cart functionality----------------------
router.get('/cart', isAuth, async (req,res)=>{
    const cartProduct = await CartItems.find({cartEmail: req.session.loginUser.email}).sort({ cartDate: -1 });
    const profileImage = await Users.findOne({email: req.session.loginUser.email});
    res.render('cart', {cartProduct:cartProduct, profileImage:profileImage, message: req.flash()});
})
router.post('/addCart', isAuth, async(req,res)=>{
    const cartProductItem = await Products.findById({ _id:req.body.productId });
     // Check if the product already exists in the cart
    const existingCartItem = await CartItems.findOne({
      cartEmail: req.session.loginUser.email,
      cartTitle: cartProductItem.title,
    });
    if (existingCartItem) {
        // If it exists, update the quantity
        const now = new Date();           // formating date
        const date = now.toLocaleDateString('en', {year: 'numeric', month: 'long', day: 'numeric'} ) + "(" + now.toLocaleTimeString('en', {hour :"2-digit", minute:"2-digit", second:"2-digit" }) +")" ;    
        existingCartItem.cartQuantity += 1;
        existingCartItem.cartDate = date;     //to show the added item at top of cart products so date is stored
        await existingCartItem.save();
      } else {
        const now = new Date();           // formating date
        const date = now.toLocaleDateString('en', {year: 'numeric', month: 'long', day: 'numeric'} ) + "(" + now.toLocaleTimeString('en', {hour :"2-digit", minute:"2-digit", second:"2-digit" }) +")" ;    
       
        const CartProduct = new CartItems({                
            cartTitle: cartProductItem.title,
            cartImg: cartProductItem.img,
            cartDesc: cartProductItem.desc,
            cartEmail: req.session.loginUser.email,
            cartPricing: cartProductItem.pricing,
            cartDate: date
        })
        await CartProduct.save();  
    }    
        req.flash("error","Item added to cart successfully!");
        res.redirect('/cart');
})
router.post('/deleteCartItem', isAuth, async(req,res)=>{
    const delCartItem = await CartItems.deleteOne({ _id:req.body.productId });
    req.flash("error","Item removed successfully!");
    res.redirect('/cart');
})

// -----------------------cash on delievery----------------------
router.post('/CashDelivery', isAuth, async(req,res)=>{
    let productTitle = req.body.title;
    const productDetails = await products.findOne({title:productTitle});
    const profileDetails = await Users.findOne({_id: req.session.loginUser._id}); //finding the database object id from session stored data. 
    const profileImage = await Users.findOne({email: req.session.loginUser.email});

    res.render('cashDelivery', { productDetails: productDetails, profileImage: profileImage, profileDetails:profileDetails});
})
// storing order and delivery details
router.post('/storeDeliveryOrder', isAuth, async(req,res)=>{
    const now = new Date();           // formating date
    const date = now.toLocaleDateString('en', {year: 'numeric', month: 'long', day: 'numeric'} ) + "(" + now.toLocaleTimeString('en', {hour :"2-digit", minute:"2-digit"}) +")" ;

    const { productName, productPrice, productQuantity, customerName, customerEmail, customerContact, deliveryAddress } = req.body;
    const DeliveryDetails = new DeliveryOrder({
        productName: productName,
        productPrice: productPrice,
        productQuantity: productQuantity,
        customerName: customerName,
        customerEmail: customerEmail,
        customerContact: customerContact,
        deliveryAddress: deliveryAddress,
        orderDate: date
    })
    await DeliveryDetails.save();
    req.flash("error", "Order placed successfully! ");
    res.redirect('/myOrders');
})
// ------------------------------My Orders functionality-------------------
router.get('/myOrders', isAuth, async(req,res)=>{
    const CustomerOrderDetails = await DeliveryOrder.find({customerEmail: req.session.loginUser.email}).sort({orderDate: -1});
    const onlinePaymentOrderDetails = await Payment.find({email: req.session.loginUser.email}).sort({date: -1});
    const profileImage = await Users.findOne({email: req.session.loginUser.email});

    res.render('myOrders', {CustomerOrderDetails:CustomerOrderDetails, profileImage:profileImage, onlinePaymentOrderDetails:onlinePaymentOrderDetails, message:req.flash()});
})
router.post('/cancelOrder', isAuth, async(req,res)=>{
    const now = new Date();           // formating date
    const date = now.toLocaleDateString('en', {year: 'numeric', month: 'long', day: 'numeric'} ) + "(" + now.toLocaleTimeString('en', {hour :"2-digit", minute:"2-digit"}) +")" ;

    const data = await DeliveryOrder.updateOne(
        {_id: new ObjectId(req.body.productId)},
        {
            $set: {
                deliveryStatus:2,
                deliveredDate: date
            }
        })
        req.flash("error", "Order Cancelled ");
        res.redirect('/myOrders');
})

// ----------------------------------Admin Delivery order Functionality------------------------
router.get('/deliveryOrders', isAdmin, async(req,res)=>{
    const DeliveryOrders = await DeliveryOrder.find().sort({orderDate: -1});
    res.render('./admin/DeliveryOrders', {DeliveryOrders:DeliveryOrders});
})
router.post('/update-deliveryStatus', isAdmin, async(req,res)=>{
    const DeliveryOrders = await DeliveryOrder.findOne({_id: new ObjectId(req.body.id)});
    res.render('./admin/updateDeliveryStatus', {DeliveryOrders:DeliveryOrders})
})
// store-update-deliveryStatus
router.post('/store-updated-DeliveryStatus', isAdmin, async(req,res)=>{
    if (req.body.deliveryStatus) {

        const now = new Date();           // formating date
        const date = now.toLocaleDateString('en', {year: 'numeric', month: 'long', day: 'numeric'} ) + "(" + now.toLocaleTimeString('en', {hour :"2-digit", minute:"2-digit"}) +")" ;    
        // Only update the delivery date if it's status is changed to 1
        const data = await DeliveryOrder.updateOne(
            {_id: new ObjectId(req.body.id)},
            {
                $set: {
                    deliveryStatus: req.body.deliveryStatus,
                    deliveredDate: date
                }
            })
            res.redirect('/deliveryOrders')
    }
})
// ------------------------ Apis & react route test end ------------------------
router.post('/logout', async (req,res)=>{
    req.session.destroy();
    res.redirect('/login');
})
router.get('*', (req,res)=>{
    res.render('notFound');
})
module.exports =  router;             //exporting router as we did in react js