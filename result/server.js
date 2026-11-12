let express = require("express"),
  async = require("async"),
  fs = require("fs"),
  pg = require("pg"),
  path = require("path"),
  cookieParser = require("cookie-parser"),
  bodyParser = require("body-parser"),
  methodOverride = require("method-override"),
  app = express(),
  server = require("http").Server(app),
  io = require("socket.io")(server)

io.set("transports", ["polling"])

function requiredEnv(name) {
  const value = process.env[name]
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`)
  }
  return value
}

const port = Number(requiredEnv("PORT"))
const postgresPort = Number(requiredEnv("POSTGRES_PORT"))

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("PORT must be a valid port number")
}

if (!Number.isInteger(postgresPort) || postgresPort < 1 || postgresPort > 65535) {
  throw new Error("POSTGRES_PORT must be a valid port number")
}

const postgresPassword = fs
  .readFileSync(requiredEnv("POSTGRES_PASSWORD_FILE"), "utf8")
  .trim()

if (!postgresPassword) {
  throw new Error("The PostgreSQL password secret file is empty")
}

io.sockets.on("connection", function (socket) {

  socket.emit("message", {text: "Welcome!"})

  socket.on("subscribe", function (data) {
    socket.join(data.channel)
  })
})

const pool = new pg.Pool({
  host: requiredEnv("POSTGRES_HOST"),
  port: postgresPort,
  database: requiredEnv("POSTGRES_DB"),
  user: requiredEnv("POSTGRES_USER"),
  password: postgresPassword,
})

async.retry(
  {times: 1000, interval: 1000},
  function (callback) {
    pool.connect(function (err, client, done) {
      if (err) {
        console.error("Waiting for db")
      }
      callback(err, client)
    })
  },
  function (err, client) {
    if (err) {
      return console.error("Giving up")
    }
    console.log("Connected to db")
    getVotes(client)
  },
)

function getVotes(client) {
  client.query("SELECT vote, COUNT(id) AS count FROM votes GROUP BY vote", [], function (err, result) {
    if (err) {
      console.error("Error performing query: " + err)
    } else {
      const votes = collectVotesFromResult(result)
      io.sockets.emit("scores", JSON.stringify(votes))
    }

    setTimeout(function () {
      getVotes(client)
    }, 1000)
  })
}

function collectVotesFromResult(result) {
  const votes = {a: 0, b: 0}

  result.rows.forEach(function (row) {
    votes[row.vote] = parseInt(row.count)
  })

  return votes
}

app.use(cookieParser())
app.use(bodyParser())
app.use(methodOverride("X-HTTP-Method-Override"))
app.use(function (req, res, next) {
  res.header("Access-Control-Allow-Origin", "*")
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept")
  res.header("Access-Control-Allow-Methods", "PUT, GET, POST, DELETE, OPTIONS")
  next()
})

app.use(express.static(__dirname + "/views"))

app.get("/", function (req, res) {
  res.sendFile(path.resolve(__dirname + "/views/index.html"))
})

server.listen(port, function () {
  const port = server.address().port
  console.log("App running on port " + port)
})
