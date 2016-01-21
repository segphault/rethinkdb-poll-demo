
var app = new Vue({
  el: "body",
  data: {
    id: null,
    poll: null
  },
  created: function() {
    this.id = window.location.search.match(/\?id=(.*)/)[1];
    console.log(this.id);

    var client = io();
    client.on("vote", this.updateVote);
    client.on("connect", () => client.emit("subscribe", this.id, this.setup));
  },
  methods: {
    setup: function(data) {
      this.poll = data;
      this.chart = $("#vote-pie").epoch({
        type: "pie", inner: 90,
        data: data.choices
      });
    },
    updateVote: function(vote) {
      this.poll.choices.find(c => c.id == vote.choice).value += 1;
      this.chart.update(this.poll.choices);

      var thinker = document.querySelector("#thinker");
      if (thinker.classList.length === 0)
        thinker.classList.add("left");
      else thinker.classList.toggle("right");
    },
    newVote: function(choice) {
      this.$http.put(`/api/polls/${this.id}`, {choice: choice.id});
    }
  }
});
