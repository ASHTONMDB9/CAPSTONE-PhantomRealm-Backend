const express = require("express"); // Used to set up a server
const cors = require("cors"); // Used to prevent errors when working locally

const app = express(); // Initialize express as an app variable
app.set("port", process.env.PORT || 4427); // Set the port
app.use(express.json()); // Enable the server to handle JSON requests
app.use(cors()); // Dont let local development give errors
app.use(express.static('public')); 

//Serves all the request which includes /images in the url from Images folder 
app.use('/index.html', express.static(__dirname + '/index.html'));

app.get("/", (req, res) => {
    res.sendFile(__dirname + "/" + "index.html");
});

app.use('/users', require('./routes/users'))
app.use('/products', require('./routes/products'))
app.use('/orders', require('./routes/orders'))

app.listen(app.get("port"), () => {
    console.log(`Listening for calls on port ${app.get("port")}`);
    console.log("Press Ctrl+C to exit server");
});
