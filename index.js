require('./keepalive.js'); // 👈 ajoute cette ligne en premier
require('dotenv').config();

const fs = require('fs');
const path = require('path');
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
  PermissionsBitField
} = require('discord.js');

console.log("TOKEN =", process.env.TOKEN ? "[OK]" : "[MISSING]");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

client.login(process.env.TOKEN);

const DATA_FILE = path.join(__dirname, 'data.json');

// 📂 Initialisation du fichier data.json
if (!fs.existsSync(DATA_FILE)) {
  fs.writeFileSync(DATA_FILE, JSON.stringify({}));
}
let userData = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));

// 📂 Fonction de sauvegarde robuste
function saveData() {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(userData, null, 2));
  } catch (err) {
    console.error('❌ Erreur lors de la sauvegarde des données :', err);
  }
}

// 📂 Sauvegarde automatique toutes les 30 secondes
setInterval(saveData, 30_000);

// 🚨 Fonction pour envoyer le message de confirmation aux admins
function sendAdminConfirmation(userId) {
  const adminCh = client.channels.cache.find(ch => ch.name === '⛧confirmation-offi⛧');
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

// 🛠 Définition des slash commands
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
  new SlashCommandBuilder()
    .setName('gg')
    .setDescription('Envoie un gros GG qui clignote !')
].map(cmd => cmd.toJSON());

const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);

client.once('ready', async () => {
  console.log(`✅ Connecté en tant que ${client.user.tag}`);
  await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
  console.log('✅ Commandes enregistrées');
});

client.on('interactionCreate', async interaction => {
  if (!interaction.isCommand() && !interaction.isButton()) return;

  const { commandName, user, member } = interaction;

  if (!userData[user.id]) {
    userData[user.id] = { xp: 0, level: 1, progress: 0, validated: false };
    saveData();
  }
  const player = userData[user.id];

  try {
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
        return interaction.reply({
          content: '🛑 Tu as déjà fait toutes tes offrandes. Reviens plus tard !',
          flags: 64
        });
      }

      if (player.validated) {
        return interaction.reply({
          content: '⏳ Tu as déjà validé ta quête. Attends la confirmation !',
          flags: 64
        });
      }

      const embed = new EmbedBuilder()
        .setColor(0xf1c40f)
        .setTitle(`🎯 Quête ${player.progress + 1}`)
        .setDescription(
          player.progress === 0
            ? `🩸 Offrande I : Verse 3000 pièces d'or dans la Gueule du Néant pour calmer la colère de l’Archi-Démon Valgorth.`
            : `🔥 Offrande II : Scelle un pacte avec les Seigneurs de l’Abîme en livrant 5000 pièces d'or au Cœur du Chaos.`
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
      if (player.validated) {
        return interaction.reply({ content: '⏳ Tu as déjà validé ta quête.', flags: 64 });
      }
      player.validated = true;
      saveData();
      await interaction.reply('✅ Tu as validé ta quête ! Les admins vont confirmer sous peu.');

      sendAdminConfirmation(user.id);
      return;
    }

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
        saveData();
        try {
          await interaction.update({ content: '✅ Ta quête est validée !', components: [] });
        } catch (err) {
          console.error('Erreur lors de la mise à jour de l’interaction bouton valider:', err);
        }

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
        const gain = td.progress === 0 ? 100 : 250;
        td.xp += gain;
        td.validated = false;
        td.progress++;
        while (td.xp >= td.level * 1000) td.level++;
        saveData();

        await interaction.reply(`✅ Quête de <@${ownerId}> confirmée ! +${gain} XP`);
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

    if (commandName === 'reini') {
      if (!member.permissions.has(PermissionsBitField.Flags.Administrator)) {
        return interaction.reply({ content: '❌ Permission refusée.', flags: 64 });
      }
      for (const id of Object.keys(userData)) {
        userData[id].validated = false;
        userData[id].progress = 0;
      }
      saveData();
      return interaction.reply('🔄 Toutes les quêtes ont été réinitialisées !');
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
              player.progress === 0
                ? '🔓 Quête 1 dispo'
                : player.progress === 1
                ? '🔓 Quête 2 dispo'
                : '✅ Toutes les quêtes complétées'
          }
        );
      return interaction.reply({ embeds: [e] });
    }

    if (commandName === 'donxp') {
      if (!member.permissions.has(PermissionsBitField.Flags.Administrator)) {
        return interaction.reply({ content: '❌ Permission refusée.', flags: 64 });
      }
      const tgt = interaction.options.getUser('joueur');
      const xpAmt = interaction.options.getInteger('xp');
      if (!userData[tgt.id]) {
        userData[tgt.id] = { xp: 0, level: 1, progress: 0, validated: false };
      }
      userData[tgt.id].xp += xpAmt;
      saveData();
      return interaction.reply({ content: `✅ ${xpAmt} XP donnés à <@${tgt.id}> !`, flags: 64 });
    }
  } catch (err) {
    console.error(err);
    try {
      await interaction.reply({ content: '❌ Une erreur est survenue.', flags: 64 });
    } catch {}
  }
});

client.login(process.env.TOKEN);
