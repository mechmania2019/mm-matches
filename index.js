// const { promisify } = require("util");
const mongoose = require("mongoose");
const { router, get } = require("microrouter");
const authenticate = require("mm-authenticate")(mongoose);
const { Script, Match, Team } = require("mm-schemas")(mongoose);

const AWS = require("aws-sdk");

const s3 = new AWS.S3({
  params: { Bucket: "mechmania" }
});

mongoose.connect(process.env.MONGO_URL);
mongoose.Promise = global.Promise;

async function getCompetitors() {
  let teams = await Team.find()
    .populate("latestScript")
    .exec();
  return teams;
}

const getMatchKey = (me, other) => {
  const [p1, p2] = [me, other].sort();
  return `logs/${p1}:${p2}`;
};

const status = ({ key, winner }, me) => {
  const p2 = key.split(":")[1];
  if (winner === 3) {
    return "tie";
  }
  if (p2 === me) {
    return winner === 2 ? "win" : "loss";
  } else {
    return winner === 1 ? "win" : "loss";
  }
};

module.exports = authenticate(
  router(
    get("/matches/:script", async (req, res) => {
      const team = req.user;
      const script = req.params.script;
      console.log(
        `${team.name} - Getting competitor scripts against ${script}`
      );
      const competitors = (await getCompetitors()).filter(
        team => team.latestScript && team.latestScript.key !== script
      );

      const matchKeyObjects = competitors.map(team => ({
        opponent: team.name,
        key: getMatchKey(script, team.latestScript.key)
      }));

      const matchToTeamName = {};
      matchKeyObjects.forEach(({ key, opponent }) => {
        matchToTeamName[key] = opponent;
      });

      const matches = await Match.find({
        key: { $in: matchKeyObjects.map(({ key }) => key) }
      }).exec();
      return matches.map(m => ({
        match: m,
        opponent: matchToTeamName[m.key],
        result: status(m, script)
      }));
    }),
    get("/:key", async (req, res) => {
      const team = req.user;
      const key = req.params.key.trim();

      console.log(`${team.name} - Getting team names ${key}`);
      const [s1, s2] = key.slice("logs/".length).split(":");
      const scripts = await Promise.all(
        [s1, s2].map(s =>
          Script.findOne({ key: s })
            .populate("owner")
            .exec()
        )
      );

      console.log(`${team.name} - Got team names`);
      console.log(scripts);

      console.log(`${team.name} - Sending headers`);
      res.setHeader("X-team-1", scripts[0].owner.name);
      res.setHeader("X-team-2", scripts[1].owner.name);

      console.log(`${team.name} - Getting logfile ${key}`);
      return s3.getObject({ Key: key }).createReadStream();
    })
  )
);
