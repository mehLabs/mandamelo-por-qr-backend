const express = require('express');
const cors = require('cors');
const fs = require('fs')
const app = express();
const path = require('path')
const multer = require('multer')

app.use(cors({
    origin: '*'
}))

//ANTES DE ABRIR EL SERVIDOR VOY A BORRAR TODOS LOS ARCHIVOS TEMPORALES
setInterval(() => {
    fs.rmSync("./tmp", { recursive:true, force:true})
    fs.mkdirSync("./tmp")
    
}, 1000*60*60);
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
                    fs.unlinkSync(`./tmp/${file}`)
                }
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
        io.to(originId).emit("error",{
            code: 1,
            text: "Archivo enviado con éxito."
        })
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
        cb(null, newName);
        sendFile(originId,id,newName);
    }
});
   
var upload = multer({storage:storage})


app.post('/:pcID', upload.single('file'), (req,res,next) => {

    console.log(`Subiendo archivo  para ${req.params.pcID}`)



})

app.get('/download/:file',(req,res) => {
    try{
        console.log("DESCARGANDO")
        
        var filePath = path.join(__dirname, '/tmp/'+req.params.file);

        res.contentType(path.basename(filePath));
        res.status(200).sendFile(filePath);
        
    }catch(err){
        console.log(err)
    }
})

server.listen(port, () => {
    console.log("Servidor corriendo en el puerto: "+port)
});

