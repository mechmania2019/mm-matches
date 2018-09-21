const mongoose = require("mongoose");
const authenticate = require("mm-authenticate")(mongoose);
const { send } = require("micro");
const { Script, Match } = require("mm-schemas")(mongoose);

mongoose.connect(process.env.MONGO_URL);
mongoose.Promise = global.Promise;

module.exports = authenticate(async (req, res) => {
  const team = req.user;
  console.log(`${team.name} - Getting matches`);
  const script = await Script.findById(team.latestScript).exec();

  const matches = await Match.find({ key: { $regex: script.key } }).exec();
  const wins = matches.map(
    match =>
      match.winner === 3
        ? "tied"
        : (match.key.split(":")[1] === match.winner && match.winner == 2) ||
          (match.key.split(":")[1] !== match.winner && match.winner == 1)
          ? "won"
          : "lost"
  );

  const oponents = matches.map(match =>
    match.key
      .replace(":", "")
      .replace("logs/", "")
      .replace(script.key, "")
  );

  let oponentsNames = await Promise.all(
    oponents.map(oponent => Script.findOne({ key: { $regex: oponent } }))
  );

  const data = {
    wins: wins,
    oponentInfo: oponentsNames
  };

  return data;
});
