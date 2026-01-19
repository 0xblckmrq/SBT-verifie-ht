const { Client, GatewayIntentBits } = require("discord.js");
const express = require("express");
const { ethers } = require("ethers");

// === CONFIG ===
const ROLE_NAME = "Human ID Verified"; // Change if needed
const SBT_CONTRACT = "0x2AA822e264F8cc31A2b9C22f39e5551241e94DfB";
const RPC_URL = "https://mainnet.optimism.io";
// ===============

const token = process.env.BOT_TOKEN;
if (!token) throw new Error("BOT_TOKEN not set");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ]
});

// Express ping server
const app = express();
app.get("/", (req, res) => res.send("Bot alive"));
app.listen(3000, () => console.log("API running on port 3000"));

// Store challenges
const challenges = new Map();

// Provider
const provider = new ethers.JsonRpcProvider(RPC_URL);
const ABI = ["function balanceOf(address owner) view returns (uint256)"];

client.once("ready", () => console.log(`Logged in as ${client.user.tag}`));

client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  if (message.content === "!verify") {
    const challenge = `Verify Discord ${message.author.id}-${Date.now()}`;
    challenges.set(message.author.id, challenge);

    return message.reply(
      `Sign this message with your wallet:\n\`${challenge}\`\n` +
      `Then reply:\n!signature <your_signature>`
    );
  }

  if (message.content.startsWith("!signature")) {
    const args = message.content.split(" ");
    if (!args[1]) return message.reply("Send: !signature <signature>");

    const signature = args[1];
    const challenge = challenges.get(message.author.id);
    if (!challenge) return message.reply("Run !verify first");

    let wallet;
    try {
      wallet = ethers.verifyMessage(challenge, signature);
    } catch (err) {
      return message.reply("❌ Invalid signature");
    }

    try {
      const contract = new ethers.Contract(SBT_CONTRACT, ABI, provider);
      const balance = await contract.balanceOf(wallet);

      if (balance === 0n) return message.reply("❌ No Human ID SBT");

      const role = message.guild.roles.cache.find(r => r.name === ROLE_NAME);
      if (!role) return message.reply("Role not found");

      const member = await message.guild.members.fetch(message.author.id);
      await member.roles.add(role);

      challenges.delete(message.author.id);
      return message.reply(`✅ Verified! Wallet: ${wallet}`);
    } catch (err) {
      console.error(err);
      return message.reply("Error checking SBT ownership");
    }
  }
});

client.login(token);
