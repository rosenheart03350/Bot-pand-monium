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
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require('discord.js');

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
    new SlashCommandBuilder().setName('metier').setDescription('Choisis ton métier via un menu déroulant'),
    new SlashCommandBuilder().setName('requete').setDescription('Envoie une requête pour un métier')
  ].map(cmd => cmd.toJSON());

  const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
  await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
  console.log('✅ Commandes enregistrées');
});

client.on('interactionCreate', async interaction => {
  const { commandName, user } = interaction;

  if (!userData[user.id]) {
    userData[user.id] = { xp: 0, level: 1, progress: 0, validated: false, metiers: [] };
    await saveUserData(user.id, userData[user.id]);
  }
  const player = userData[user.id];

  try {
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
            { label: 'Enchantement', value: 'Enchantement', emoji: '✨' },
            { label: 'Herboriste', value: 'Herboriste', emoji: '🌿' },
            { label: 'Travailleur du cuir', value: 'Travailleur du cuir', emoji: '👞' }
            { label: 'Joaillier', value: 'Joaillier', emoji: '💎' }
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

        const publicChannel = interaction.guild.channels.cache.find(c => c.name === 'metiers' && c.isTextBased());
        if (publicChannel) publicChannel.send(`🎉 **${interaction.user.username}** a rejoint la guilde des **${metier}** !`);
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
      const metier = interaction.customId.replace('modal_objet_', '');
      const objet = interaction.fields.getTextInputValue('objet');

      const embed = new EmbedBuilder()
        .setColor(0xa335ee)
        .setTitle(`🔮 ${objet}`)
        .setDescription(`📢 Requête envoyée par **${interaction.user.username}**\n👷 Métier ciblé : **${metier}**`)
        .setFooter({ text: 'Un artisan peut répondre à cette demande.' })
        .setTimestamp();

      const bouton = new ButtonBuilder()
        .setCustomId(`accepter_${metier}_${interaction.user.id}`)
        .setLabel('Accepter')
        .setStyle(ButtonStyle.Primary);

      const rowButton = new ActionRowBuilder().addComponents(bouton);

      const channel = interaction.guild.channels.cache.find(c => c.name === 'metiers' && c.isTextBased());
      if (channel) channel.send({ embeds: [embed], components: [rowButton] });

      const role = interaction.guild.roles.cache.find(r => r.name.toLowerCase() === metier.toLowerCase());
      if (role) role.members.forEach(m => m.send({ embeds: [embed] }).catch(() => {}));

      return interaction.reply({ content: `✅ Ta requête pour **${objet}** a été envoyée aux **${metier}**.`, ephemeral: true });
    }

    // ---------------- BOUTON ACCEPTER ----------------
    if (interaction.isButton() && interaction.customId.startsWith('accepter_')) {
      const [ , metier, requesterId ] = interaction.customId.split('_');
      const role = interaction.guild.roles.cache.find(r => r.name.toLowerCase() === metier.toLowerCase());

      if (!role || !interaction.member.roles.cache.has(role.id)) {
        return interaction.reply({ content: '❌ Tu n’as pas le rôle requis pour accepter cette requête.', ephemeral: true });
      }

      if (interaction.user.id === requesterId) {
        return interaction.reply({ content: '❌ Tu ne peux pas accepter ta propre requête !', ephemeral: true });
      }

      const requester = await client.users.fetch(requesterId);

      // MP à la personne qui a fait la requête
      if (requester) {
        requester.send(`🛠 **${interaction.user.username}** a accepté ta requête pour **${metier}**, le craft est en cours !`).catch(() => {});
      }

      // MP à l'artisan avec bouton "Terminer la commande"
      const finishButton = new ButtonBuilder()
        .setCustomId(`terminer_${metier}_${requesterId}_${interaction.user.id}`)
        .setLabel('✅ Terminer la commande')
        .setStyle(ButtonStyle.Success);

      const finishRow = new ActionRowBuilder().addComponents(finishButton);

      await interaction.user.send({
        content: `📦 Tu as accepté la requête de **${requester.username}** pour le métier **${metier}**.\nClique sur le bouton ci-dessous une fois la commande terminée :`,
        components: [finishRow]
      }).catch(() => {});

      await interaction.reply({ content: `✅ Tu as accepté la requête de ${requester.username} ! Un message t’a été envoyé pour la suite.`, ephemeral: true });

      // Désactiver le bouton dans le salon
      const newRow = new ActionRowBuilder().addComponents(
        ButtonBuilder.from(interaction.message.components[0].components[0]).setDisabled(true)
      );
      await interaction.message.edit({ components: [newRow] });
    }

    // ---------------- BOUTON TERMINER ----------------
    if (interaction.isButton() && interaction.customId.startsWith('terminer_')) {
      const [ , metier, requesterId, artisanId ] = interaction.customId.split('_');

      if (interaction.user.id !== artisanId) {
        return interaction.reply({ content: '❌ Seul l’artisan qui a accepté cette commande peut la terminer.', ephemeral: true });
      }

      const requester = await client.users.fetch(requesterId);
      const guild = client.guilds.cache.first();
      const metierChannel = guild.channels.cache.find(c => c.name === 'metiers' && c.isTextBased());

      if (requester) {
        requester.send(`🎉 Ta commande pour **${metier}** a été terminée par **${interaction.user.username}** !`).catch(() => {});
      }

      if (metierChannel) {
        metierChannel.send(`✅ **${interaction.user.username}** a terminé la commande pour **${requester.username}** en tant que **${metier}** !`);
      }

      await interaction.reply({ content: '✅ Tu as confirmé la fin de la commande. Bien joué !', ephemeral: true });

      const newRow = new ActionRowBuilder().addComponents(
        ButtonBuilder.from(interaction.component).setDisabled(true)
      );
      await interaction.message.edit({ components: [newRow] }).catch(() => {});
    }

  } catch (err) {
    console.error(err);
    if (interaction.deferred || interaction.replied) await interaction.editReply('❌ Une erreur est survenue.');
    else await interaction.reply({ content: '❌ Une erreur est survenue.', flags: 64 });
  }
});

client.login(process.env.TOKEN);



