require('./keepalive.js');
require('dotenv').config();

const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
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
    if (rows) {
      rowIndex = rows.findIndex(r => r[0] === userId);
    }

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
  } catch (error) {
    console.error('❌ Erreur sauvegarde userData', error);
  }
}

client.once('ready', async () => {
  console.log(`Connecté en tant que ${client.user.tag}`);
  await chargerUserData();

  const commands = [
    new SlashCommandBuilder().setName('profil').setDescription('Affiche ton profil avec tes métiers'),
    new SlashCommandBuilder()
      .setName('donxp')
      .setDescription('Donne de l\'XP à un joueur')
      .addUserOption(opt => opt.setName('joueur').setDescription('Le joueur qui reçoit l\'XP').setRequired(true))
      .addIntegerOption(opt => opt.setName('xp').setDescription('Le nombre d\'XP à donner').setRequired(true)),
    new SlashCommandBuilder().setName('gg').setDescription('Envoie un gros GG qui clignote !'),
    new SlashCommandBuilder().setName('metier').setDescription('Choisis ton métier via un menu déroulant'),
    new SlashCommandBuilder().setName('requete').setDescription('Envoie une requête à un métier')
  ].map(cmd => cmd.toJSON());

  const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
  await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
  console.log('✅ Commandes enregistrées');
});

client.on('interactionCreate', async interaction => {
  const { commandName, user, member } = interaction;

  if (!userData[user.id]) {
    userData[user.id] = { xp: 0, level: 1, progress: 0, validated: false };
    await saveUserData(user.id, userData[user.id]);
  }

  const player = userData[user.id];

  try {
    // ---------------- COMMANDES EXISTANTES ----------------
    if (commandName === 'gg') {
      let visible = true;
      let count = 0;
      const message = await interaction.reply({ content: '**🎉 GG 🎉**', fetchReply: true });
      const interval = setInterval(() => {
        if (count >= 6) {
          clearInterval(interval);
          return;
        }
        visible = !visible;
        message.edit({ content: visible ? '**🎉 GG 🎉**' : '‎ ' });
        count++;
      }, 500);
      return;
    }

    if (commandName === 'donxp') {
      if (!member.permissions.has(PermissionsBitField.Flags.Administrator)) {
        return interaction.reply({ content: '❌ Permission refusée.', ephemeral: true });
      }
      await interaction.deferReply();
      const tgt = interaction.options.getUser('joueur');
      const xpAmt = interaction.options.getInteger('xp');
      if (!userData[tgt.id]) {
        userData[tgt.id] = { xp: 0, level: 1, progress: 0, validated: false };
      }
      userData[tgt.id].xp += xpAmt;
      await saveUserData(tgt.id, userData[tgt.id]);
      return interaction.editReply(`✅ ${xpAmt} XP donnés à <@${tgt.id}> !`);
    }

    // ---------------- COMMANDE PROFIL ----------------
    if (commandName === 'profil') {
      const roles = member.roles.cache
        .filter(r => !r.managed && r.name !== '@everyone')
        .map(r => r.name)
        .join(', ') || 'Aucun métier';
      const e = new EmbedBuilder()
        .setColor(0x3498db)
        .setTitle(`📜 Profil de ${user.username}`)
        .addFields(
          { name: '🔢 Niveau', value: `Niv ${player.level}`, inline: true },
          { name: '💠 XP', value: `${player.xp} XP`, inline: true },
          { name: '⚒️ Métiers', value: roles }
        );
      return interaction.reply({ embeds: [e] });
    }

    // ---------------- COMMANDE METIER ----------------
    if (commandName === 'metier') {
      const row = new ActionRowBuilder()
        .addComponents(
          new StringSelectMenuBuilder()
            .setCustomId('choix_metier')
            .setPlaceholder('Sélectionne ton métier')
            .addOptions([
              { label: 'Forgeron', value: 'Forgeron', emoji: '⚒️' },
              { label: 'Mineur', value: 'Mineur', emoji: '⛏️' },
              { label: 'Alchimiste', value: 'Alchimiste', emoji: '🧪' },
              { label: 'Couturier', value: 'Couturier', emoji: '🧵' },
              { label: 'Ingénieur', value: 'Ingénieur', emoji: '🔧' },
              { label: 'Enchanteur', value: 'Enchanteur', emoji: '✨' },
              { label: 'Herboriste', value: 'Herboriste', emoji: '🌿' },
              { label: 'Travailleur du cuir', value: 'Travailleur du cuir', emoji: '👞' }
            ])
        );
      await interaction.reply({ content: '🔽 Choisis ton métier :', components: [row], ephemeral: true });
    }

    // ---------------- COMMANDE REQUETE ----------------
    if (commandName === 'requete') {
      const row = new ActionRowBuilder()
        .addComponents(
          new StringSelectMenuBuilder()
            .setCustomId('requete_metier')
            .setPlaceholder('Sélectionne le métier à contacter')
            .addOptions([
              { label: 'Forgeron', value: 'Forgeron', emoji: '⚒️' },
              { label: 'Mineur', value: 'Mineur', emoji: '⛏️' },
              { label: 'Alchimiste', value: 'Alchimiste', emoji: '🧪' },
              { label: 'Couturier', value: 'Couturier', emoji: '🧵' },
              { label: 'Ingénieur', value: 'Ingénieur', emoji: '🔧' },
              { label: 'Enchanteur', value: 'Enchanteur', emoji: '✨' },
              { label: 'Herboriste', value: 'Herboriste', emoji: '🌿' },
              { label: 'Travailleur du cuir', value: 'Travailleur du cuir', emoji: '👞' }
            ])
        );
      await interaction.reply({ content: '🔽 Sélectionne le métier à contacter :', components: [row], ephemeral: true });
    }

    // ---------------- GESTION DES MENUS SELECT ----------------
    if (interaction.isStringSelectMenu()) {
      const metier = interaction.values[0];
      const role = interaction.guild.roles.cache.find(r => r.name.toLowerCase() === metier.toLowerCase());

      if (!role) return interaction.reply({ content: `❌ Le rôle ${metier} n'existe pas.`, ephemeral: true });

      if (interaction.customId === 'choix_metier') {
        // Ajout métier au membre
        await interaction.member.roles.add(role);

        // Message public
        const publicChannel = interaction.guild.channels.cache.find(c => c.name === 'metiers' && c.isTextBased());
        if (publicChannel) publicChannel.send(`🎉 **${interaction.user.username}** a rejoint la guilde des **${metier}** !`);

        // Message privé
        await interaction.user.send(
          `✅ Merci d'avoir rejoint la guilde des **${metier}** !\n💡 Pour envoyer des requêtes, utilise /requete.`
        );

        return interaction.reply({ content: `✅ Tu es maintenant **${metier}** !`, ephemeral: true });
      }

      if (interaction.customId === 'requete_metier') {
        // Répondre immédiatement pour éviter échec
        await interaction.reply({ content: `✅ Ta requête a été envoyée à la guilde des ${metier}.`, ephemeral: true });

        // DM aux membres du rôle
        role.members.forEach(m => {
          m.send(`📢 ${interaction.user.username} a envoyé une requête à la guilde des ${metier} !`).catch(() => {});
        });

        // Message public
        const publicChannel = interaction.guild.channels.cache.find(c => c.name === 'metiers' && c.isTextBased());
        if (publicChannel) {
          publicChannel.send(`📢 ${interaction.user.username} a envoyé une requête à la guilde des ${metier} !`);
        }
      }
    }

  } catch (err) {
    console.error(err);
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply('❌ Une erreur est survenue.');
    } else {
      await interaction.reply({ content: '❌ Une erreur est survenue.', ephemeral: true });
    }
  }
});

client.login(process.env.TOKEN);
