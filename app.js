var app = require("koa")();
var router = require("koa-router")();
var bluebird = require("bluebird");
var config = require("./config");

app.use(require("koa-validate")());
app.use(require("koa-bodyparser")());
app.use(require("koa-stylus")(`${__dirname}/public`));
app.use(require("koa-static")(`${__dirname}/public`));
app.use(router.routes());

var server = require("http").createServer(app.callback());
var io = require("socket.io")(server);
var r = require("rethinkdbdash")(config.database);

bluebird.coroutine(function*() {
  try {
    if (!(yield r.dbList().contains(config.database.db))) {
      yield r.dbCreate(config.database.db);
      yield bluebird.all(["polls", "votes"].map(t => r.tableCreate(t)));
      yield bluebird.all([
        r.table("votes").indexCreate("poll"),
        r.table("votes").indexCreate("choice")
      ]);

      yield r.table("polls").insert({
        title: "Who is the best Star Trek captain?",
        choices: ["Captain Kirk", "Captain Archer", "Captain Janeway", "Captain Picard", "Captain Sisko"].map(i => ({id: r.uuid(), label: i})),
        created: r.now()
      });

    }

    (yield r.table("votes").changes()("new_val")).each((err, vote) => {
      io.to(`poll:${vote.poll}`).emit("vote", vote);
    });
  }
  catch (err) {
    console.error("Setup failed:", err);
  }
})();

server.listen(8000, () => console.log("Server started on port 8000"));

io.on("connection", bluebird.coroutine(function*(client) {
  client.on("subscribe", (id, callback) => {
    r.table("polls").get(id).merge({
      choices: r.row("choices").merge(c => ({
        value: r.table("votes").getAll(c("id"), {index: "choice"}).count()
      }))
    }).then(callback);
    client.join(`poll:${id}`);
  });
}));

router.put("/api/polls/:poll", function*() {
  var check = r.table("polls")
               .get(this.params.poll)("choices")("id")
               .contains(this.request.body.choice).default(false);

  var output = yield r.branch(check, r.table("votes").insert({
    poll: this.params.poll,
    choice: this.request.body.choice,
    created: r.now()
  }), false);

  this.body = {success: output.inserted > 0 || false};
});

router.post("/api/polls", function*() {
  var output = yield r.table("polls").insert({
    title: this.request.body.title,
    choices: this.request.body.choices.map(i => ({id: r.uuid(), label: i})),
    created: r.now()
  });

  this.body = {id: output.generated_keys[0]};
});

router.get("/api/polls", function*() {
  this.body = yield r.table("polls").coerceTo("array");
})
