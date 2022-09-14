const express = require('express');
const cors = require('cors');
const fs = require('fs')
const app = express();
const path = require('path')
const multer = require('multer')
const upload = multer();


app.use(cors({
    origin: '*'
}))


const server = require('http').createServer(app);
const port = 8080;
const {Server} =require('socket.io')
const io = new Server(server,{
    cors: {
        origin: '*',
        methods: ["GET","POST"]
    }
})


let users = [];
let rooms = [];

const newUser = (id) => {
    users.push(id);
}
const newRoom = (id) => {
    rooms.push(id)
}

const ensureDirectoryExistence = (filePath) => {
    let dirName = path.dirname(filePath);
    fs.mkdir(dirName, { recursive: true }, (err) => {
        if (err) throw err;
      });
    return fs.existsSync(dirName);
}

io.on('connection', (socket) => {

    newUser(socket.id);
    console.log(`Un usuario se ha conectado. Hay ${users.length} usuarios conectados.`);

    socket.on('newRoom', ()=>{
        const id= socket.id;
        console.log("CREANDO NUEVA SALA. ID= "+id)
        socket.join(id);
        newRoom(id);
        io.to(id).emit("newRoom",id)
    })
    socket.on('join', (id) => {
        console.log("Usuario conectandose a la sala: "+id)
        socket.join(id);
        let clientsInRoom = 0;
        if (io.sockets.adapter.rooms.has(id)) clientsInRoom = io.sockets.adapter.rooms.get(id).size
        console.log("Hay "+clientsInRoom+" en la misma sala")
    })

    socket.on('download', (stream, name, callback) => {
        callback({
            name: "example.txt",
            size: 500
        })

        const file = fs.createWriteStream("example.txt")
        io.to(socket.id).emit("Esta es la url")
    })

    socket.on("disconnect", () => {
        for (let i=0;i<users.length;i++){
            let clientId = users[i].id;
            if (socket.id === clientId){
                users.splice(i,1);
                break;
            }
        }
        console.log(`Un usuario se ha desconectado. Tenemos ${users.length} clientes conectados.`);
    })

})

app.get('/', (req,res)=> {
    res.send({response: "I'm alive"}).status(200);
})

app.post('/:pcID', upload.array('file'), (req,res) => {
    console.log(req.file)
    console.log(`Subiendo archivo  para ${req.params.pcID}`)

    const pathString = `/tmp/${req.params.pcID}/tempFile1`;
    const filePath = path.join(__dirname, pathString); //TODO crear archivos secuencialmente, tempFile1, tempFile2, ...

    if (ensureDirectoryExistence(filePath)){
        console.log(true);
        const stream = fs.createWriteStream(filePath);

        stream.on('open', () => {
            return req.pipe(stream);
        })
    
        stream.on('drain', () => {
            // Calculate how much data has been piped yet
            const written = parseInt(stream.bytesWritten);
            const total = parseInt(req.headers['content-length']);
            const pWritten = (written / total * 100).toFixed(2)
            console.log(`Processing  ...  ${pWritten}% done`);
        });
        
        stream.on('close', () => {
            // Send a success response back to the client
            const msg = `Data uploaded to ${filePath}`;
            console.log('Processing  ...  100%');
            console.log(msg);
            res.status(200).send({ status: 'success', msg });
        });
        
        stream.on('error', err => {
            // Send an error message to the client
            console.error(err);
            res.status(500).send({ status: 'error', err });
        });
    }

})

server.listen(port, () => {
    console.log("Servidor corriendo en el puerto: "+port)
});

