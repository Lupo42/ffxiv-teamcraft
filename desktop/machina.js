const MachinaFFXIV = require('node-machina-ffxiv');
const isDev = require('electron-is-dev');
const path = require('path');
const { app } = require('electron');
const log = require('electron-log');
const { elevate } = require('node-windows');
const spawnAsAdmin = require('spawn-as-admin');
const childProcess = require('child_process');

const machinaExePath = path.join(app.getAppPath(), '../../resources/MachinaWrapper/MachinaWrapper.exe');

let Machina;

function sendToRenderer(win, packet) {
  win && win.webContents && win.webContents.send('packet', packet);
}

function filterPacketSessionID(packet) {
  const packetsFromOthers = [
    'playerSpawn',
    'actorControl',
    'updateClassInfo',
    'actorControlSelf',
    'effectResult',
    'eventPlay',
    'eventStart',
    'eventFinish',
    'eventPlay4',
    'someDirectorUnk4',
    'npcSpawn',
    'objectSpawn'
  ];
  return packetsFromOthers.indexOf(packet.type) > -1
    || packet.sourceActorSessionID === packet.targetActorSessionID;
}

// Add machina to firewall stuffs
function addMachinaFirewallRule() {
  const machinaExePath = path.join(app.getAppPath(), '../../resources/MachinaWrapper/MachinaWrapper.exe');
  elevate(`netsh advfirewall firewall delete rule name="FFXIVTeamcraft - Machina" && netsh advfirewall firewall add rule name="FFXIVTeamcraft - Machina" dir=in action=allow program="${machinaExePath}" enable=yes`);
}

module.exports.addMachinaFirewallRule = addMachinaFirewallRule;

module.exports.start = function(win, config, verbose, winpcap, pid) {
  log.info('winpcap', winpcap);

  const region = config.get('region', null);
  const options = isDev ?
    {
      monitorType: winpcap ? 'WinPCap' : 'RawSocket',
      parseAlgorithm: 'PacketSpecific',
      region: region
    } : {
      parseAlgorithm: 'PacketSpecific',
      noData: true,
      monitorType: winpcap ? 'WinPCap' : 'RawSocket',
      region: region,
      machinaExePath: machinaExePath,
      remoteDataPath: path.join(app.getAppPath(), '../../resources/remote-data'),
      definitionsDir: path.join(app.getAppPath(), '../../resources/app.asar.unpacked/node_modules/node-machina-ffxiv/models/default')
    };

  options.logger = message => {
    if (message.level === 'info' && verbose) {
      log.info(message.message);
    } else if (message.level !== 'info') {
      log[message.level || 'warn'](message.message);
    }
  };

  options.spawn = (exePath, args) => {
    if (args.includes('WinPCap')) {
      return childProcess.spawn(exePath, args);
    } else {
      return elevate(exePath, args);
    }
  };

  if (pid) {
    options.pid = pid;
  }

  const acceptedPackets = [
    'actorCast',
    'itemInfo',
    'updateInventorySlot',
    'inventoryTransaction',
    'currencyCrystalInfo',
    'marketBoardItemListingCount',
    'marketBoardItemListing',
    'marketBoardItemListingHistory',
    'marketBoardSearchResult',
    'marketTaxRates',
    'playerSetup',
    'playerSpawn',
    'inventoryModifyHandler',
    'npcSpawn',
    'objectSpawn',
    'playerStats',
    'updateClassInfo',
    'actorControl',
    'initZone',
    'effectResult',
    'eventPlay',
    'eventStart',
    'eventFinish',
    'eventPlay4',
    'eventPlay32',
    'someDirectorUnk4',
    'actorControlSelf',
    'retainerInformation',
    'weatherChange',
    'updatePositionHandler',
    'updatePositionInstance',
    'prepareZoning'
  ];

  Machina = new MachinaFFXIV(options);
  Machina.filter(acceptedPackets);
  Machina.start(() => {
    log.info('Packet capture started');
  });
  Machina.setMaxListeners(0);
  Machina.on('any', (packet) => {
    if (verbose) {
      log.log(JSON.stringify(packet));
    }
    if (!filterPacketSessionID(packet)) {
      return;
    }
    if (acceptedPackets.indexOf(packet.type) > -1 || acceptedPackets.indexOf(packet.superType) > -1) {
      sendToRenderer(win, packet);
    }
  });
};

module.exports.stop = function() {
  if (Machina) {
    Machina.stop();
  }
};
