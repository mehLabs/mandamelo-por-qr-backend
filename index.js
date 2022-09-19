const express = require('express');
const cors = require('cors');
const fs = require('fs')
const app = express();
const path = require('path')
const multer = require('multer')
const maxSize = 1024*1024*1024;

app.use(cors({
    origin: '*'
}))

//ANTES DE ABRIR EL SERVIDOR VOY A BORRAR TODOS LOS ARCHIVOS TEMPORALES
const resetTemp = () => {
    try {
        fs.rmSync("./tmp", { recursive:true, force:true})
        fs.mkdirSync("./tmp")
    } catch (error) {
        console.log(error)
    }
}

resetTemp();
setInterval(() => {
    resetTemp();
    
}, 1000*60*60*24);


//

const server = require('http').createServer(app);
const port = 7000;
const {Server} =require('socket.io')
const io = new Server(server,{
    cors: {
        origin: '*',
        methods: ["GET","POST"]
    }
})


let users = [];
let rooms = [];

const getUser = (id) => {
    console.log(`Buscando id ${id}`)
    console.log(users)
    for (let i=0;i<users.length;i++){
        if (id === users[i].id){
            return users[i]
        }
    }
    console.log("usuario no encontrado")
    return 0;
}

const newUser = (id) => {
    users.push(
        {
            id: id,
            files: []
        }
    );
}
const newRoom = (id) => {
    rooms.push(id)
}

const getExtension = (file) => {
    
    var re = /(?:\.([^.]+))?$/;
    return re.exec(file)[0];
}

io.on('connection', (socket) => {

    newUser(socket.id);
    console.log(`Un usuario se ha conectado. Hay ${users.length} usuarios conectados.`);

    socket.on('newRoom', ()=>{
        const id= socket.id;
        console.log("CREANDO NUEVA SALA. ID="+id)
        socket.join("room:"+id);
        newRoom("room:"+id);
        io.to(id).emit("newRoom",id)
        let clientsInRoom = 0;
        if (io.sockets.adapter.rooms.has("room"+id)) clientsInRoom = io.sockets.adapter.rooms.get("room"+id).size
        console.log("Hay "+clientsInRoom+" en la misma sala")
    })
    socket.on('join', (id) => {
        console.log(rooms)
        console.log("Usuario conectandose a la sala: "+id)
        socket.join("room:"+id);
        let clientsInRoom = 0;
        if (io.sockets.adapter.rooms.has("room:"+id)) clientsInRoom = io.sockets.adapter.rooms.get("room:"+id).size
        if (clientsInRoom <= 1) {
            socket.emit("error", {
                code: 0,
                text: "emptyroom"
            })
        }
        console.log("Hay "+clientsInRoom+" en la misma sala")
    })

    socket.on('download', (stream, name, callback) => {
        callback({
            name: name
        })

        const file = fs.createWriteStream("example.txt")
        file.pipe(stream);
    })

    socket.on("disconnect", () => {
        for (let i=0;i<users.length;i++){
            let clientId = users[i].id;
            if (socket.id === clientId){
                for (let file of users[i].files){
                    try {
                        fs.unlinkSync(`./tmp/${file}`)
                    } catch (error) {
                        console.log(error)
                    }
                }
                users.splice(i,1);
                break;
            }
        }
        console.log(rooms)
        if (rooms.includes("room:"+socket.id)){
            io.to("room:"+socket.id).emit("error",{
                code:0,
                text: "emptyroom"
            })
        }
        console.log(`Un usuario se ha desconectado. Tenemos ${users.length} clientes conectados.`);
    })

})

app.get('/', (req,res)=> {
    res.send({response: "I'm alive"}).status(200);
})

const sendFile = (originId,id,filename) => {
    var filePath = path.join(__dirname, '/tmp/'+filename);
    let usuario = getUser(id);
    if (usuario === 0){
        console.log(originId) 
        console.log("Error")
        io.to(originId).emit("error",{
            code: 1,
            text: "El otro usuario se ha desconectado, por favor escanee el QR otra vez."
        })
    }else{
        usuario.files.push(filename)
        io.to(id).emit("newFile",filename);
        setTimeout(() => {
            fs.unlink(`./tmp/${filename}`);
            let fileId = usuario.files.indexOf(filename);
            usuario.files.splice(fileId,1);
        }, 1000*60*30);
        
    }
    
}


const fileSizeLimitErrorHandler = (err, req, res, next) => {
    if (err) {
      res.sendStatus(413)
    } else {
        next()
    }
  }

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, './tmp');
    },
    filename: (req, file, cb) => {
        const fileName = file.originalname.toLowerCase().split(' ').join('-');
        var re = /(?:\.([^.]+))?$/;
        const ext = re.exec(fileName)[0];
        const id = req.params.pcID;
        const originId = req.query.id;
        const newName = "file-id_" + id + '-' + Date.now() +  ext;

        if (req.headers['content-length'] > maxSize){
            console.log("warning")
        }else{
            sendFile(originId,id,newName);
        }
        cb(null, newName);
    }
});
   
var upload = multer({
    storage:storage,
    limits: { fileSize: 1024*1024*1024}
})


app.post('/:pcID', upload.single('file'), fileSizeLimitErrorHandler, (req,res,next) => {
    console.log("File uploaded succesfully")
    res.sendStatus(200)


})

app.get('/download/:file',(req,res) => {
    try{
        console.log("DESCARGANDO")
        
        try {
            var filePath = path.join(__dirname, '/tmp/'+req.params.file);
        } catch (error) {
            console.log(error);
            res.statusCode(404)
        }

        res.contentType(path.basename(filePath));
        res.status(200).sendFile(filePath);
        
    }catch(err){
        console.log(err)
    }
})

server.listen(port, () => {
    console.log("Servidor corriendo en el puerto: "+port)
});

