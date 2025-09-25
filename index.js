require('./keepalive.js');
require('dotenv').config();

const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  EmbedBuilder,
  StringSelectMenuBuilder,
  ActionRowBuilder,
  PermissionsBitField
} = require('discord.js');

const { lirePlage, ecrirePlage } = require('./sheets.js');

console.log("TOKEN =", process.env.TOKEN ? "[OK]" : "[MISSING]");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

let userData = {};

// ----- MÉTIERS -----
const METIERS = [
  { label: 'Forgeron', value: 'Forgeron', emoji: '⚒️' },
  { label: 'Mineur', value: 'Mineur', emoji: '⛏️' },
  { label: 'Alchimiste', value: 'Alchimiste', emoji: '🧪' },
  { label: 'Couturier', value: 'Couturier', emoji: '🧵' },
  { label: 'Ingénieur', value: 'Ingénieur', emoji: '🔧' },
  { label: 'Enchanteur', value: 'Enchanteur', emoji: '✨' },
  { label: 'Herboriste', value: 'Herboriste', emoji: '🌿' },
  { label: 'Travailleur du cuir', value: 'Travailleur du cuir', emoji: '👞' }
];

// ----- FONCTIONS GOOGLE SHEETS -----
async function chargerUserData() {
  try {
    const rows = await lirePlage('Bot-Rosen!A2:E');
    if (rows && rows.length) {
      for (const row of rows) {
        const [id, xp, level, progress, validated] = row;
        userData[id] = {
          xp: parseInt(xp) || 0,
          level: parseInt(level) || 1,
          progress: parseInt(progress) || 0,
          validated: validated === 'true'
        };
      }
    }
  } catch (e) {
    console.error('❌ Erreur chargement userData depuis Sheets', e);
  }
}

async function saveUserData(userId, data) {
  try {
    let rows = await lirePlage('Bot-Rosen!A2:A');
    let rowIndex = -1;
    if (rows) rowIndex = rows.findIndex(r => r[0] === userId);

    const values = [[
      data.xp.toString(),
      data.level.toString(),
      data.progress.toString(),
      data.validated.toString()
    ]];

    if (rowIndex === -1) {
      const lastRow = rows ? rows.length + 1 : 1;
      const range = `Bot-Rosen!A${lastRow + 1}:E${lastRow + 1}`;
      await ecrirePlage(range, [[userId, ...values[0]]]);
    } else {
      const range = `Bot-Rosen!B${rowIndex + 2}:E${rowIndex + 2}`;
      await ecrirePlage(range, values);
    }

    userData[userId] = data;
  } catch (err) {
    console.error('❌ Erreur sauvegarde userData', err);
  }
}

// ----- BOT READY -----
client.once('ready', async () => {
  console.log(`Connecté en tant que ${client.user.tag}`);
  await chargerUserData();

  // Enregistrement des commandes
  const commands = [
    new SlashCommandBuilder().setName('profil').setDescription('Affiche ton profil et métiers'),
    new SlashCommandBuilder().setName('metier').setDescription('Choisis ton métier via un menu déroulant'),
    new SlashCommandBuilder().setName('donxp').setDescription('Donne de l\'XP à un joueur')
      .addUserOption(opt => opt.setName('joueur').setDescription('Le joueur qui reçoit l\'XP').setRequired(true))
      .addIntegerOption(opt => opt.setName('xp').setDescription('Le nombre d\'XP à donner').setRequired(true)),
    new SlashCommandBuilder().setName('gg').setDescription('Envoie un gros GG qui clignote !'),
    new SlashCommandBuilder().setName('requete').setDescription('Demande de l’aide à un métier')
  ].map(cmd => cmd.toJSON());

  const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
  await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
  console.log('✅ Commandes enregistrées');
});

// ----- INTERACTIONS -----
client.on('interactionCreate', async interaction => {
  const { commandName, user, member } = interaction;

  if (!userData[user.id]) {
    userData[user.id] = { xp: 0, level: 1, progress: 0, validated: false };
    await saveUserData(user.id, userData[user.id]);
  }
  const player = userData[user.id];

  try {
    // ----- /gg -----
    if (commandName === 'gg') {
      let visible = true;
      let count = 0;
      const message = await interaction.reply({ content: '**🎉 GG 🎉**', fetchReply: true });
      const interval = setInterval(() => {
        if (count >= 6) return clearInterval(interval);
        visible = !visible;
        message.edit({ content: visible ? '**🎉 GG 🎉**' : '‎ ' });
        count++;
      }, 500);
      return;
    }

    // ----- /profil -----
    if (commandName === 'profil') {
      const userRoles = member.roles.cache
        .filter(r => METIERS.some(m => m.value.toLowerCase() === r.name.toLowerCase()))
        .map(r => r.name);

      const embed = new EmbedBuilder()
        .setTitle(`📜 Profil de ${user.username}`)
        .setColor(0x3498db)
        .addFields(
          { name: '🔢 Niveau', value: `Niv ${player.level}`, inline: true },
          { name: '💠 XP', value: `${player.xp} XP`, inline: true },
          { name: '🎯 Métiers', value: userRoles.length ? userRoles.join(', ') : 'Aucun métier', inline: true }
        );

      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    // ----- /metier -----
    if (commandName === 'metier') {
      const row = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('choix_metier')
          .setPlaceholder('Sélectionne ton métier')
          .addOptions(METIERS)
      );
      return interaction.reply({ content: '🔽 Choisis ton métier :', components: [row], ephemeral: true });
    }

    // ----- /donxp -----
    if (commandName === 'donxp') {
      if (!member.permissions.has(PermissionsBitField.Flags.Administrator))
        return interaction.reply({ content: '❌ Permission refusée.', flags: 64 });

      await interaction.deferReply();
      const tgt = interaction.options.getUser('joueur');
      const xpAmt = interaction.options.getInteger('xp');

      if (!userData[tgt.id]) userData[tgt.id] = { xp: 0, level: 1, progress: 0, validated: false };
      userData[tgt.id].xp += xpAmt;
      await saveUserData(tgt.id, userData[tgt.id]);

      return interaction.editReply(`✅ ${xpAmt} XP donnés à <@${tgt.id}> !`);
    }

    // ----- /requete -----
    if (commandName === 'requete') {
      const row = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('requete_metier')
          .setPlaceholder('Sélectionne le métier pour ta requête')
          .addOptions(METIERS)
      );
      return interaction.reply({ content: '🔽 À quel métier veux-tu envoyer ta requête ?', components: [row], ephemeral: true });
    }

    // ----- GESTION DES MENUS DÉROULANTS -----
    if (interaction.isStringSelectMenu()) {
      const metier = interaction.values[0];
      const role = interaction.guild.roles.cache.find(r => r.name.toLowerCase() === metier.toLowerCase());
      if (!role) return interaction.reply({ content: `❌ Le rôle **${metier}** n'existe pas.`, ephemeral: true });

      // Choix métier
      if (interaction.customId === 'choix_metier') {
        try {
          await interaction.member.roles.add(role);
          const publicChannel = interaction.guild.channels.cache.find(c => c.name === 'metiers' && c.isTextBased());
          if (publicChannel) publicChannel.send(`🎉 **${interaction.user.username}** a rejoint la guilde des **${metier}** !`);
          await interaction.user.send(`✅ Merci d'avoir rejoint la guilde des **${metier}** !`);
          return interaction.reply({ content: `✅ Tu es maintenant **${metier}** !`, ephemeral: true });
        } catch (err) {
          console.error(err);
          return interaction.reply({ content: '❌ Impossible d’ajouter le rôle ou d’envoyer le message.', ephemeral: true });
        }
      }

      // Requête métier
      if (interaction.customId === 'requete_metier') {
        role.members.forEach(m => {
          m.send(`📢 ${interaction.user.username} a envoyé une requête à la guilde des ${metier} !`);
        });
        const publicChannel = interaction.guild.channels.cache.find(c => c.name === 'metiers' && c.isTextBased());
        if (publicChannel) publicChannel.send(`📢 ${interaction.user.username} a envoyé une requête à la guilde des ${metier} !`);
        return interaction.reply({ content: `✅ Ta requête a été envoyée à la guilde des ${metier}.`, ephemeral: true });
      }
    }

  } catch (err) {
    console.error(err);
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply('❌ Une erreur est survenue.');
    } else {
      await interaction.reply({ content: '❌ Une erreur est survenue.', flags: 64 });
    }
  }
});

client.login(process.env.TOKEN);
