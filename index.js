require('./keepalive.js');
require('dotenv').config();

const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionsBitField,
  StringSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder
} = require('discord.js');

const fetch = require('node-fetch');
const cheerio = require('cheerio');

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
    const rows = await require('./sheets.js').lirePlage('Bot-Rosen!A2:E');
    if (rows && rows.length) {
      for (const row of rows) {
        const [id, xp, level, progress, validated] = row;
        userData[id] = {
          xp: parseInt(xp) || 0,
          level: parseInt(level) || 1,
          progress: parseInt(progress) || 0,
          validated: validated === 'true',
          metiers: []
        };
      }
    }
  } catch (e) {
    console.error('❌ Erreur chargement userData depuis Sheets', e);
  }
}

async function saveUserData(userId, data) {
  try {
    const ecrirePlage = require('./sheets.js').ecrirePlage;
    let rows = await require('./sheets.js').lirePlage('Bot-Rosen!A2:A');
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
  } catch (error) {
    console.error('❌ Erreur sauvegarde userData', error);
  }
}

client.once('ready', async () => {
  console.log(`Connecté en tant que ${client.user.tag}`);
  await chargerUserData();

  const commands = [
    new SlashCommandBuilder().setName('profil').setDescription('Affiche ton profil et tes métiers'),
    new SlashCommandBuilder()
      .setName('donxp')
      .setDescription('Donne de l\'XP à un joueur')
      .addUserOption(opt => opt.setName('joueur').setDescription('Le joueur qui reçoit l\'XP').setRequired(true))
      .addIntegerOption(opt => opt.setName('xp').setDescription('Le nombre d\'XP à donner').setRequired(true)),
    new SlashCommandBuilder().setName('gg').setDescription('Envoie un gros GG qui clignote !'),
    new SlashCommandBuilder().setName('metier').setDescription('Choisis ton métier via un menu déroulant'),
    new SlashCommandBuilder().setName('requete').setDescription('Envoie une requête pour un métier')
  ].map(cmd => cmd.toJSON());

  const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
  await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
  console.log('✅ Commandes enregistrées');
});

client.on('interactionCreate', async interaction => {
  const { commandName, user, member } = interaction;

  if (!userData[user.id]) {
    userData[user.id] = { xp: 0, level: 1, progress: 0, validated: false, metiers: [] };
    await saveUserData(user.id, userData[user.id]);
  }
  const player = userData[user.id];

  try {
    // ---------------- GG ----------------
    if (commandName === 'gg') {
      let visible = true;
      let count = 0;
      const message = await interaction.reply({ content: '**🎉 GG 🎉**', fetchReply: true });
      const interval = setInterval(() => {
        if (count >= 6) { clearInterval(interval); return; }
        visible = !visible;
        message.edit({ content: visible ? '**🎉 GG 🎉**' : '‎ ' });
        count++;
      }, 500);
      return;
    }

    // ---------------- PROFIL ----------------
    if (commandName === 'profil') {
      const metiers = player.metiers.length ? player.metiers.join(', ') : 'Aucun';
      const e = new EmbedBuilder()
        .setColor(0x3498db)
        .setTitle(`📜 Profil de ${user.username}`)
        .addFields(
          { name: '🔢 Niveau', value: `Niv ${player.level}`, inline: true },
          { name: '💠 XP', value: `${player.xp} XP`, inline: true },
          { name: '🛠 Métiers', value: metiers }
        );
      return interaction.reply({ embeds: [e] });
    }

    // ---------------- DON XP ----------------
    if (commandName === 'donxp') {
      if (!member.permissions.has(PermissionsBitField.Flags.Administrator)) {
        return interaction.reply({ content: '❌ Permission refusée.', flags: 64 });
      }
      await interaction.deferReply();
      const tgt = interaction.options.getUser('joueur');
      const xpAmt = interaction.options.getInteger('xp');
      if (!userData[tgt.id]) userData[tgt.id] = { xp: 0, level: 1, progress: 0, validated: false, metiers: [] };
      userData[tgt.id].xp += xpAmt;
      await saveUserData(tgt.id, userData[tgt.id]);
      return interaction.editReply(`✅ ${xpAmt} XP donnés à <@${tgt.id}> !`);
    }

    // ---------------- METIER ----------------
    if (commandName === 'metier') {
      const row = new ActionRowBuilder().addComponents(
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

      return interaction.reply({ content: '🔽 Choisis ton métier :', components: [row], ephemeral: true });
    }

    // ---------------- REQUETE ----------------
    if (commandName === 'requete') {
      const row = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('choix_metier_requete')
          .setPlaceholder('Choisis le métier pour ta requête')
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

      return interaction.reply({ content: '🔽 Sélectionne le métier pour ta requête :', components: [row], ephemeral: true });
    }

    // ---------------- SELECT MENU ----------------
    if (interaction.isStringSelectMenu()) {
      if (interaction.customId === 'choix_metier') {
        const metier = interaction.values[0];
        const role = interaction.guild.roles.cache.find(r => r.name.toLowerCase() === metier.toLowerCase());
        if (!role) return interaction.reply({ content: `❌ Rôle ${metier} introuvable.`, ephemeral: true });

        await interaction.member.roles.add(role);
        if (!player.metiers.includes(metier)) player.metiers.push(metier);

        // Message public
        const publicChannel = interaction.guild.channels.cache.find(c => c.name === 'metiers' && c.isTextBased());
        if (publicChannel) publicChannel.send(`🎉 **${interaction.user.username}** a rejoint la guilde des **${metier}** !`);

        // DM utilisateur
        await interaction.user.send(`✅ Tu as rejoint la guilde des **${metier}** !`);

        return interaction.reply({ content: `✅ Tu es maintenant **${metier}** !`, ephemeral: true });
      }

      if (interaction.customId === 'choix_metier_requete') {
        const metier = interaction.values[0];
        const modal = new ModalBuilder()
          .setCustomId(`modal_objet_${metier}`)
          .setTitle(`Requête pour ${metier}`);

        const input = new TextInputBuilder()
          .setCustomId('objet')
          .setLabel('Nom de l’objet')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('Ex : Épée légendaire de la tempête')
          .setRequired(true);

        modal.addComponents(new ActionRowBuilder().addComponents(input));
        return interaction.showModal(modal);
      }
    }

    // ---------------- MODAL SUBMIT ----------------
    if (interaction.isModalSubmit() && interaction.customId.startsWith('modal_objet_')) {
      const metier = interaction.customId.split('_')[2];
      const objet = interaction.fields.getTextInputValue('objet');

      // Recherche sur Wowhead
      const searchUrl = `https://www.wowhead.com/search?q=${encodeURIComponent(objet)}`;
      const res = await fetch(searchUrl);
      const text = await res.text();
      const $ = cheerio.load(text);

      const firstItem = $('.listview-cleartext').first();
      if (!firstItem.length) return interaction.reply({ content: `❌ Objet "${objet}" introuvable sur Wowhead.`, ephemeral: true });

      const itemName = firstItem.text();
      const itemLink = 'https://www.wowhead.com' + firstItem.attr('href');
      const iconUrl = firstItem.closest('tr').find('img').attr('src') || 'https://wow.zamimg.com/images/wow/icons/large/inv_misc_questionmark.jpg';

      const embed = new EmbedBuilder()
        .setTitle(`Nouvelle requête !`)
        .setColor(0x1abc9c)
        .setDescription(`👤 Joueur : ${interaction.user.username}\n🛠 Métier : ${metier}\n⚔ Objet : [${itemName}](${itemLink})`)
        .setThumbnail(iconUrl);

      // Envoi dans le canal métier
      const channel = interaction.guild.channels.cache.find(c => c.name.toLowerCase() === metier.toLowerCase() && c.isTextBased());
      if (channel) channel.send({ embeds: [embed] });

      // DM utilisateur
      await interaction.user.send({ content: '✅ Ta requête a été envoyée !', embeds: [embed] });

      return interaction.reply({ content: '✅ Requête envoyée !', ephemeral: true });
    }

  } catch (err) {
    console.error(err);
    if (interaction.deferred || interaction.replied) await interaction.editReply('❌ Une erreur est survenue.');
    else await interaction.reply({ content: '❌ Une erreur est survenue.', flags: 64 });
  }
});

client.login(process.env.TOKEN);
