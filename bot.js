const { Client, GatewayIntentBits } = require('discord.js');
const { ethers } = require('ethers');
const crypto = require('crypto');
const express = require('express');

// -------------------- CONFIG --------------------
const DISCORD_TOKEN = process.env.BOT_TOKEN ; // Your bot token
const ROLE_NAME = "Human ID verified"; // Role in your Discord server
const SBT_CONTRACT = "0x2AA822e264F8cc31A2b9C22f39e5551241e94DfB";
const OPTIMISM_RPC = "https://mainnet.optimism.io";
// -------------------------------------------------

// Discord client
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
});

// Ethers setup
const provider = new ethers.JsonRpcProvider(OPTIMISM_RPC);
const sbtAbi = [
  "function balanceOf(address owner) view returns (uint256)"
];
const sbtContract = new ethers.Contract(SBT_CONTRACT, sbtAbi, provider);

// Temporary storage for challenges
const challenges = {};

// Optional API for debugging
const app = express();
app.get('/verify/:address', async (req, res) => {
  try {
    const address = req.params.address;
    const balance = await sbtContract.balanceOf(address);
    res.json({ address, holdsSBT: balance > 0 });
  } catch (err) {
    res.json({ error: err.message });
  }
});
app.listen(3000, () => console.log("API running on port 3000"));

// -------------------- BOT --------------------
client.on('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);
});

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  // Step 1: User starts verification
  if (message.content.startsWith('!verify')) {
    const args = message.content.split(' ');
    if (!args[1]) {
      message.reply("Please provide your wallet address. Example: `!verify 0xYourWalletAddress`");
      return;
    }

    const wallet = args[1].toLowerCase();
    const balance = await sbtContract.balanceOf(wallet);
    if (balance <= 0) {
      message.reply("This wallet does not hold the required Human ID SBT.");
      return;
    }

    // Generate a random message
    const challenge = crypto.randomBytes(16).toString('hex');
    challenges[message.author.id] = { wallet, challenge, timestamp: Date.now() };
    message.reply(
      `To verify your wallet, please sign the following message in your wallet and send it back:\n\n` +
      `\`${challenge}\`\n\n` +
      `Then reply with: !signature <signedMessage>`
    );
    return;
  }

  // Step 2: User submits signature
  if (message.content.startsWith('!signature')) {
    const args = message.content.split(' ');
    if (!args[1]) {
      message.reply("Please provide your signed message. Example: `!signature <signedMessage>`");
      return;
    }

    const userChallenge = challenges[message.author.id];
    if (!userChallenge) {
      message.reply("No verification request found. Start with `!verify <wallet>` first.");
      return;
    }

    const { wallet, challenge } = userChallenge;
    const signature = args[1];

    try {
      const recovered = ethers.verifyMessage(challenge, signature);
      if (recovered.toLowerCase() === wallet) {
        // Assign role
        const role = message.guild.roles.cache.find(r => r.name === ROLE_NAME);
        if (!role) {
          message.reply(`Role "${ROLE_NAME}" not found. Please create it first.`);
          return;
        }
        const member = await message.guild.members.fetch(message.author.id);
        await member.roles.add(role);
        message.reply("Success! You have been given the Human ID verified role.");
        delete challenges[message.author.id]; // Clear challenge
      } else {
        message.reply("Signature does not match the provided wallet.");
      }
    } catch (err) {
      console.error("Signature verification error:", err);
      message.reply("Error verifying signature. Make sure you signed the exact message provided.");
    }
    return;
  }
});

client.login(DISCORD_TOKEN);
