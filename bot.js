import { Client, GatewayIntentBits } from 'discord.js';
import { REST } from '@discordjs/rest';
import { Routes } from 'discord-api-types/v9';
import fs from 'fs';
import axios from 'axios';

// Initialize Discord client
const client = new Client({
    intents: [GatewayIntentBits.Guilds],
});

// Load your data.json and config.json files
const data = JSON.parse(fs.readFileSync('data.json', 'utf8'));
const config = JSON.parse(fs.readFileSync('config.json', 'utf8')); // Load config.json

// Define your bot token and other constants directly here
const DISCORD_TOKEN = 'YOUR_DISCORD_BOT_TOKEN'; // Replace with your bot token
const CLIENT_ID = '1300388610415001661'; // Your client ID
const GUILD_ID = '1300384802091827252'; // Your guild (server) ID
const CSFLOAT_API_KEY = 'YOUR_CS_FLOAT_API_KEY'; // Replace with your CSFloat API key

// Define the commands
const commands = [
    {
        name: 'search',
        description: 'Search for a skin listing',
        options: [
            {
                type: 3, // STRING
                name: 'weapon',
                description: 'The weapon name',
                required: true,
            },
            {
                type: 3, // STRING
                name: 'skin',
                description: 'The skin name',
                required: true,
            },
            {
                type: 3, // STRING
                name: 'phase',
                description: 'The phase number (optional)',
                required: false,
            },
            {
                type: 3, // STRING
                name: 'paint_seed',
                description: 'The paint seed for the skin (optional)',
                required: false,
            },
        ],
    },
    {
        name: 'locate',
        description: 'Find listings based on weapon, skin, phase, and tier',
        options: [
            {
                type: 3, // STRING
                name: 'weapon',
                description: 'The weapon name',
                required: true,
            },
            {
                type: 3, // STRING
                name: 'skin',
                description: 'The skin name',
                required: true,
            },
            {
                type: 3, // STRING
                name: 'phase',
                description: 'The phase number (optional)',
                required: true,
            },
            {
                type: 3, // STRING
                name: 'tier',
                description: 'The tier for paint seeds',
                required: true,
            },
        ],
    },
];

// Register commands
const rest = new REST({ version: '9' }).setToken(DISCORD_TOKEN);

(async () => {
    try {
        console.log('Started refreshing application (/) commands.');

        await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), {
            body: commands,
        });

        console.log('Successfully reloaded application (/) commands.');
    } catch (error) {
        console.error(error);
    }
})();

// When the bot is ready
client.on('ready', () => {
    console.log(`Logged in as ${client.user.tag}`);
});

// Handle interactions
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isCommand()) return;

    const { commandName } = interaction;

    if (commandName === 'search') {
        const weapon = interaction.options.getString('weapon');
        const skin = interaction.options.getString('skin');
        const phase = interaction.options.getString('phase') || ''; // Default to empty string if not provided
        const paintSeed = interaction.options.getString('paint_seed') || ''; // Get the paint seed if provided

        await interaction.deferReply(); // Defer the reply to give more time for processing

        await handleSearch(interaction, weapon, skin, phase, paintSeed);
    } else if (commandName === 'locate') {
        const weapon = interaction.options.getString('weapon');
        const skin = interaction.options.getString('skin');
        const phase = interaction.options.getString('phase') || ''; // Default to empty string if not provided
        const tier = interaction.options.getString('tier'); // Get the tier

        // Retrieve paint seeds for the specified tier from config.json
        const paintSeeds = config.tiers[tier] || [];
        if (paintSeeds.length === 0) {
            await interaction.reply(`No paint seeds found for tier ${tier}.`);
            return;
        }

        await interaction.deferReply(); // Defer the reply to give more time for processing

        await handleFind(interaction, weapon, skin, phase, paintSeeds);
    }
});

// Function to handle the search command
async function handleSearch(interaction, weapon, skin, phase, paintSeed) {
    // Construct the market hash name
    const marketHashName = `${weapon} | ${skin}${phase ? ` (Phase ${phase})` : ''}`.trim();

    // Define the API request parameters based on the skin
    let defIndex = '7'; // Default def_index for skins without phases
    let paintIndex = '';

    const skinsWithPhases = {
        "Karambit": { defIndex: '507', paintIndices: { '1': '418', '2': '419', '3': '420', '4': '421' } },
        // Add more skins with phases here if needed
    };

    // Check if the weapon is in the skinsWithPhases object
    if (skinsWithPhases[weapon]) {
        defIndex = skinsWithPhases[weapon].defIndex;
        paintIndex = phase ? skinsWithPhases[weapon].paintIndices[phase] || '' : '';
    }

    // Construct the API URL for the search
    let apiUrl = `https://csfloat.com/api/v1/listings?market_hash_name=${encodeURIComponent(marketHashName)}&max_float=0.08&def_index=${defIndex}`;
    if (paintIndex) {
        apiUrl += `&paint_index=${paintIndex}`;
    }
    if (paintSeed) {
        apiUrl += `&paint_seed=${paintSeed}`; // Use the provided paint seed if any
    }

    console.log('API URL:', apiUrl); // Log the constructed API URL for debugging

    try {
        const response = await axios.get(apiUrl, {
            headers: {
                Authorization: CSFLOAT_API_KEY, // Use your CSFloat API key
            },
        });

        console.log('Full API Response for search:', response.data);

        // Check if listings are found
        if (!response.data || response.data.length === 0) {
            await interaction.followUp(`No listings found for ${marketHashName}.`);
            return;
        }

        // Group the listings into batches of 5
        const listings = response.data;
        const listingsPerMessage = 5;
        const totalMessages = Math.ceil(listings.length / listingsPerMessage);

        // Send each group of 5 listings as a separate embed message
        for (let i = 0; i < totalMessages; i++) {
            const messageListings = listings.slice(i * listingsPerMessage, (i + 1) * listingsPerMessage);
            const embed = createListingsEmbed(messageListings);

            await interaction.followUp({ embeds: [embed] });

            if (i % 5 === 0) {
                await new Promise(resolve => setTimeout(resolve, 1000)); // Wait for 1 second
            }
        }
    } catch (error) {
        if (error.response) {
            console.error('API Error:', error.response.data);
        } else {
            console.error('Error:', error.message);
        }
        await interaction.followUp('An error occurred while fetching listings.');
    }
}

// Function to handle the find command
async function handleFind(interaction, weapon, skin, phase, paintSeeds) {
    // Construct the market hash name
    const marketHashName = `${weapon} | ${skin}${phase ? ` (Phase ${phase})` : ''}`.trim();

    // Define the API request parameters based on the skin
    let defIndex = '7'; // Default def_index for skins without phases
    let paintIndex = '';

    const skinsWithPhases = {
        "Karambit": { defIndex: '507', paintIndices: { '1': '418', '2': '419', '3': '420', '4': '421' } },
        // Add more skins with phases here if needed
    };

    if (skinsWithPhases[weapon]) {
        defIndex = skinsWithPhases[weapon].defIndex;
        paintIndex = phase ? skinsWithPhases[weapon].paintIndices[phase] || '' : '';
    }

    const allListings = [];

    // Loop through each paint seed in the specified tier
    for (const paintSeed of paintSeeds) {
        let apiUrl = `https://csfloat.com/api/v1/listings?market_hash_name=${encodeURIComponent(marketHashName)}%max_float=0.08&def_index=${defIndex}`;
        if (paintIndex) {
            apiUrl += `&paint_index=${paintIndex}`;
        }
        apiUrl += `&paint_seed=${paintSeed}`; // Use the current paint seed

        console.log('API URL:', apiUrl); // Log the constructed API URL for debugging

        try {
            const response = await axios.get(apiUrl, {
                headers: {
                    Authorization: CSFLOAT_API_KEY, // Use your CSFloat API key
                },
            });

            console.log('Full API Response for seed', paintSeed, ':', response.data);

            if (response.data && response.data.length > 0) {
                allListings.push(...response.data.map(listing => ({ ...listing, paint_seed: paintSeed }))); // Add the found listings to the allListings array with paint_seed
            }
        } catch (error) {
            if (error.response) {
                console.error('API Error:', error.response.data);
            } else {
                console.error('Error:', error.message);
            }
            await interaction.followUp('An error occurred while fetching listings.');
            return;
        }
    }

    if (allListings.length === 0) {
        await interaction.followUp(`No listings found for ${marketHashName}.`);
        return;
    }

    const listingsPerMessage = 5;
    const totalMessages = Math.ceil(allListings.length / listingsPerMessage);

    for (let i = 0; i < totalMessages; i++) {
        const messageListings = allListings.slice(i * listingsPerMessage, (i + 1) * listingsPerMessage);
        const embed = createListingsEmbed(messageListings);

        await interaction.followUp({ embeds: [embed] });

        if (i % 5 === 0) {
            await new Promise(resolve => setTimeout(resolve, 1000)); // Wait for 1 second
        }
    }
}

// Function to create an embed for a batch of listings
function createListingsEmbed(listings) {
    const fields = listings.map(listing => ({
        name: `Listing for ${listing.item.market_hash_name} (Paint Seed: ${listing.paint_seed})`, // Added paint_seed here
        value: `**Price:** $${(listing.price / 100).toFixed(2)}\n**Float:** ${listing.item.float_value}\n**View Listing:** [Link](https://csfloat.com/item/${listing.id})`,
    }));

    return {
        title: `Listings`,
        fields: fields,
        color: 0x0099ff,
    };
}

// Login the bot
client.login(DISCORD_TOKEN);
