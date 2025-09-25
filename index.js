require('./keepalive.js');
require('dotenv').config();

const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  EmbedBuilder,
  ButtonBuilder,
  ActionRowBuilder,
  ButtonStyle,
  PermissionsBitField,
  StringSelectMenuBuilder
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

  try {
    await ecrirePlage('Bot-Rosen!A2:C2', [['TestUser', 'XP: 100', 'Niveau: 2']]);
    console.log("✅ Écriture réussie dans Google Sheets !");
    const data = await lirePlage('Bot-Rosen!A2:C2');
    console.log("📄 Données lues dans Google Sheets :", data);
  } catch (error) {
    console.error("❌ Erreur lors du test Google Sheets :", error);
  }

  const commands = [
    new SlashCommandBuilder().setName('quete').setDescription('Obtiens ta quête actuelle'),
    new SlashCommandBuilder().setName('valider').setDescription('Tu valides avoir fait ta quête'),
    new SlashCommandBuilder()
      .setName('confirmer')
      .setDescription('Un admin confirme la quête d’un joueur')
      .addUserOption(opt => opt.setName('joueur').setDescription('Le joueur à confirmer').setRequired(true)),
    new SlashCommandBuilder().setName('reini').setDescription('Réinitialise toutes les quêtes'),
    new SlashCommandBuilder().setName('profil').setDescription('Affiche ton profil RPG'),
    new SlashCommandBuilder()
      .setName('donxp')
      .setDescription('Donne de l\'XP à un joueur')
      .addUserOption(opt => opt.setName('joueur').setDescription('Le joueur qui reçoit l\'XP').setRequired(true))
      .addIntegerOption(opt => opt.setName('xp').setDescription('Le nombre d\'XP à donner').setRequired(true)),
    new SlashCommandBuilder().setName('gg').setDescription('Envoie un gros GG qui clignote !'),
    new SlashCommandBuilder().setName('metier').setDescription('Choisis ton métier via un menu déroulant')
  ].map(cmd => cmd.toJSON());

  const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
  await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
  console.log('✅ Commandes enregistrées');
});

function sendAdminConfirmation(userId) {
  const adminCh = client.channels.cache.find(ch => ch.name === 'admin-quete');
  if (!adminCh) return;

  const btn = new ButtonBuilder()
    .setCustomId(`confirmer_${userId}`)
    .setLabel('✅ Confirmer')
    .setStyle(ButtonStyle.Success);

  adminCh.send({
    content: `⚠️ <@${userId}> a validé sa quête.`,
    components: [new ActionRowBuilder().addComponents(btn)]
  }).catch(console.error);
}

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

    if (commandName === 'quete') {
      if (player.progress >= 2) {
        return interaction.reply({ content: '🛑 Tu as déjà fait toutes tes offrandes. Reviens plus tard !', flags: 64 });
      }
      if (player.validated) {
        return interaction.reply({ content: '⏳ Tu as déjà validé ta quête. Attends la confirmation !', flags: 64 });
      }

      const embed = new EmbedBuilder()
        .setColor(0xf1c40f)
        .setTitle(`🎯 Quête ${player.progress + 1}`)
        .setDescription(
          player.progress === 0
            ? `🩸 Offrande I : Verse 3000 pièces d'or dans la Gueule du Néant.`
            : `🔥 Offrande II : Livre 5000 pièces d'or au Cœur du Chaos.`
        )
        .setFooter({ text: 'Clique sur le bouton ci-dessous pour valider.' });

      const button = new ButtonBuilder()
        .setCustomId(`valider_${user.id}`)
        .setLabel('✅ Valider')
        .setStyle(ButtonStyle.Success);

      const row = new ActionRowBuilder().addComponents(button);
      return interaction.reply({ embeds: [embed], components: [row] });
    }

    if (commandName === 'valider') {
      await interaction.deferReply({ ephemeral: true });
      if (player.validated) {
        return interaction.editReply('⏳ Tu as déjà validé ta quête.');
      }
      player.validated = true;
      await saveUserData(user.id, player);
      await interaction.editReply('✅ Tu as validé ta quête ! Les admins vont confirmer sous peu.');
      sendAdminConfirmation(user.id);
      return;
    }

    if (commandName === 'reini') {
      if (!member.permissions.has(PermissionsBitField.Flags.Administrator)) {
        return interaction.reply({ content: '❌ Permission refusée.', flags: 64 });
      }
      await interaction.deferReply();
      for (const id of Object.keys(userData)) {
        userData[id].validated = false;
        userData[id].progress = 0;
        await saveUserData(id, userData[id]);
      }
      return interaction.editReply('🔄 Toutes les quêtes ont été réinitialisées !');
    }

    if (commandName === 'profil') {
      const e = new EmbedBuilder()
        .setColor(0x3498db)
        .setTitle(`📜 Profil de ${user.username}`)
        .addFields(
          { name: '🔢 Niveau', value: `Niv ${player.level}`, inline: true },
          { name: '💠 XP', value: `${player.xp} XP`, inline: true },
          {
            name: '📌 Progression',
            value:
              player.progress >= 2
                ? '✅ Toutes les quêtes complétées'
                : player.progress === 1
                ? '🔓 Quête 2 dispo'
                : '🔓 Quête 1 dispo'
          }
        );
      return interaction.reply({ embeds: [e] });
    }

    if (commandName === 'donxp') {
      if (!member.permissions.has(PermissionsBitField.Flags.Administrator)) {
        return interaction.reply({ content: '❌ Permission refusée.', flags: 64 });
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

    // ---------------- NOUVELLE COMMANDE METIER ----------------
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

      await interaction.reply({
        content: '🔽 Choisis ton métier :',
        components: [row],
        ephemeral: true
      });
    }

    // ---------------- GESTION DES INTERACTIONS ----------------
    if (interaction.isButton()) {
      const [action, ownerId] = interaction.customId.split('_');

      if (action === 'valider') {
        if (interaction.user.id !== ownerId) {
          return interaction.reply({ content: `❌ Seul <@${ownerId}> peut valider cette quête.`, flags: 64 });
        }
        const p = userData[ownerId];
        if (p.validated) {
          return interaction.reply({ content: '⏳ Quête déjà validée.', flags: 64 });
        }
        p.validated = true;
        await saveUserData(ownerId, p);
        await interaction.update({ content: '✅ Ta quête est validée !', components: [] });
        sendAdminConfirmation(ownerId);
        return;
      }

      if (action === 'confirmer') {
        if (!member.permissions.has(PermissionsBitField.Flags.Administrator)) {
          return interaction.reply({ content: '❌ Tu n’as pas la permission.', flags: 64 });
        }
        const td = userData[ownerId];
        if (!td.validated) {
          return interaction.reply({ content: `❌ <@${ownerId}> n’a pas validé sa quête.`, flags: 64 });
        }
        await interaction.deferReply();
        const gain = td.progress === 0 ? 100 : 250;
        td.xp += gain;
        td.validated = false;
        td.progress++;

        let oldLevel = td.level;
        while (td.xp >= td.level * 1000) td.level++;
        await saveUserData(ownerId, td);

        if (td.level > oldLevel) {
          const levelChannel = client.channels.cache.find(c => c.name === '⛧💰requête-tribut💰⛧');
          if (levelChannel && levelChannel.isTextBased()) {
            const levelEmbed = new EmbedBuilder()
              .setColor(0xffd700)
              .setTitle(`🏅 LEVEL UP !`)
              .setDescription(`**<@${ownerId}>** est passé au **niveau ${td.level}** !`)
              .addFields(
                { name: '🎯 XP Actuel', value: `${td.xp} XP`, inline: true },
                { name: '🚀 Niveau précédent', value: `${oldLevel}`, inline: true },
                { name: '📈 Nouveau niveau', value: `${td.level}`, inline: true }
              )
              .setThumbnail('https://cdn-icons-png.flaticon.com/512/820/820610.png')
              .setFooter({ text: 'Continue tes offrandes pour progresser...', iconURL: client.user.displayAvatarURL() })
              .setTimestamp();

            await levelChannel.send({ embeds: [levelEmbed] });
          }
        }

        await interaction.editReply(`✅ Quête de <@${ownerId}> confirmée ! +${gain} XP`);
        try {
          await client.users.fetch(ownerId).then(u =>
            u.send({
              embeds: [
                new EmbedBuilder()
                  .setColor(0x2ecc71)
                  .setTitle('🎉 Quête Terminée !')
                  .setDescription(`Tu as terminé la quête ${td.progress} !`)
                  .addFields(
                    { name: '🏆 XP Gagné', value: `+${gain} XP`, inline: true },
                    { name: '📈 Niveau', value: `Niv ${td.level}`, inline: true },
                    { name: '⭐ Total XP', value: `${td.xp} XP`, inline: true }
                  )
              ]
            })
          );
        } catch {}
        return;
      }
    }

    // ---------------- GESTION DU MENU SELECT ----------------
    if (interaction.isStringSelectMenu()) {
      if (interaction.customId === 'choix_metier') {
        const metier = interaction.values[0];
        const role = interaction.guild.roles.cache.find(r => r.name.toLowerCase() === metier.toLowerCase());

        if (!role) {
          return interaction.reply({ content: `❌ Le rôle **${metier}** n'existe pas sur ce serveur.`, ephemeral: true });
        }

        try {
          await interaction.member.roles.add(role);
          return interaction.reply({ content: `✅ Tu es maintenant **${metier}** !`, ephemeral: true });
        } catch (err) {
          console.error('❌ Erreur ajout rôle métier :', err);
          return interaction.reply({ content: '❌ Impossible d’ajouter le rôle.', ephemeral: true });
        }
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
