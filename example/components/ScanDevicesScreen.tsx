/**
 * Sample BLE React Native App
 */

import {useNavigation} from '@react-navigation/native';
import {Buffer} from 'buffer';
import React, {useState, useEffect, useRef} from 'react';
import {
  SafeAreaView,
  StyleSheet,
  View,
  Text,
  StatusBar,
  NativeModules,
  NativeEventEmitter,
  Platform,
  PermissionsAndroid,
  FlatList,
  TouchableHighlight,
  Pressable,
} from 'react-native';
import {Colors} from 'react-native/Libraries/NewAppScreen';
import BleManager, {
  BleDisconnectPeripheralEvent,
  BleManagerDidUpdateValueForCharacteristicEvent,
  BleScanCallbackType,
  BleScanMatchMode,
  BleScanMode,
  Peripheral,
} from 'react-native-ble-manager';

const SECONDS_TO_SCAN_FOR = 3;
const SERVICE_UUIDS: string[] = ['fff0'];
const ALLOW_DUPLICATES = true;

const BleManagerModule = NativeModules.BleManager;
const bleManagerEmitter = new NativeEventEmitter(BleManagerModule);

declare module 'react-native-ble-manager' {
  // enrich local contract with custom state properties needed by App.tsx
  interface Peripheral {
    connected?: boolean;
    connecting?: boolean;
  }
}

const ScanDevicesScreen = () => {
  const navigation = useNavigation();

  const [isScanning, setIsScanning] = useState(false);
  const [peripherals, setPeripherals] = useState(
    new Map<Peripheral['id'], Peripheral>(),
  );

  //console.debug('peripherals map updated', [...peripherals.entries()]);

  const startScan = () => {
    if (!isScanning) {
      // reset found peripherals before scan
      setPeripherals(new Map<Peripheral['id'], Peripheral>());
      try {
        console.debug('[startScan] starting scan...');
        setIsScanning(true);
        BleManager.scan(SERVICE_UUIDS, SECONDS_TO_SCAN_FOR, ALLOW_DUPLICATES, {
          matchMode: BleScanMatchMode.Sticky,
          scanMode: BleScanMode.LowLatency,
          callbackType: BleScanCallbackType.AllMatches,
        })
          .then(() => {
            console.debug('[startScan] scan promise returned successfully.');
          })
          .catch((err: any) => {
            console.error('[startScan] ble scan returned in error', err);
          });
      } catch (error) {
        console.error('[startScan] ble scan error thrown', error);
      }
    }
  };

  const [blueInfo, setBlueInfo] = useState({
    serviceUUID: 'fff0',
    writeUUID: 'fff2',
    readUUID: 'fff1',
    serialnumber: null,
    deviceName: null,
    deviceId: null,
    peripheralId: null,
  });

  // Bước 1: mở kết nối chọn bluetooth
  const startCompanionScan = () => {
    setPeripherals(new Map<Peripheral['id'], Peripheral>());
    try {
      console.debug('[startCompanionScan] starting companion scan...');
      BleManager.companionScan(SERVICE_UUIDS, {single: false})
        .then(async (peripheral: Peripheral | null) => {
          console.debug(
            '[startCompanionScan] scan promise returned successfully.',
            peripheral,
          );
          // có chọn kết nối thì lưu lại => tiến hành connected
          if (peripheral != null) {
            setBlueInfo({
              ...blueInfo,
              serialnumber: peripheral.id,
              deviceName: peripheral.name,
              deviceId: peripheral.id,
            });
            await BleManager.disconnect(peripheral.id);
            BleManager.connect(peripheral.id)
              .then((data: any) => {
                console.log('connect data: ', data);
              })
              .catch((error: any) => {
                console.log('connect error: ', error);
              });

            // setPeripherals(map => {
            //   return new Map(map.set(peripheral.id, peripheral));
            // });
          }
        })
        .catch((err: any) => {
          console.debug('[startCompanionScan] ble scan cancel', err);
        });
    } catch (error) {
      console.error('[startCompanionScan] ble scan error thrown', error);
    }
  };

  // Bước 0: mở bluetooth
  const enableBluetooth = async () => {
    try {
      console.debug('[enableBluetooth]');
      await BleManager.enableBluetooth();
    } catch (error) {
      console.error('[enableBluetooth] thrown', error);
    }
  };

  // bước 2: truyền thông tin xuống
  const sendToDevice = async () => {
    console.log('sendToDevice: ', blueInfo);
    await BleManager.connect(blueInfo.deviceId);
    if (!blueInfo.serviceUUID || !blueInfo.deviceId) return;
    // gọi lấy thông tin dữ liệu
    const buffer = Buffer.from(
      new Uint8Array(toArrayBuffer(Buffer.from(Buffer.from('#100;')))),
    );

    const regularArr = Array.from(buffer);
    const writeWithoutResponse = await BleManager.writeWithoutResponse(
      blueInfo.deviceId,
      blueInfo.serviceUUID,
      blueInfo.writeUUID,
      regularArr,
    );
    console.log('writeWithoutResponse: ', writeWithoutResponse);
  };

  const handleStopScan = () => {
    setIsScanning(false);
    console.debug('[handleStopScan] scan is stopped.');
  };

  const handleDisconnectedPeripheral = (
    event: BleDisconnectPeripheralEvent,
  ) => {
    console.debug(
      `[handleDisconnectedPeripheral][${event.peripheral}] disconnected.`,
    );
    setPeripherals(map => {
      const p = map.get(event.peripheral);
      if (p) {
        p.connected = false;
        return new Map(map.set(event.peripheral, p));
      }
      return map;
    });
  };

  const handleConnectPeripheral = (event: any) => {
    console.log(`[handleConnectPeripheral][${event.peripheral}] connected.`);
  };
  const lisRef = useRef<any>([]);
  const handleUpdateValueForCharacteristic = (
    data: BleManagerDidUpdateValueForCharacteristicEvent,
  ) => {
    const array = JSON.parse('[' + data.value + ']');
    const string = new Buffer(array).toString();
    console.log('------ handleUpdateValueForCharacteristic: ', string);
    const exist = string
      .split(' ')
      .filter((item: any) => item.trim().length > 0);

    // tính hiệu bắt đầu
    if (exist.includes('print') || exist.includes('date')) {
      lisRef.current = [];
      return;
    }

    //  tính hiệu kết thúc
    if (exist.includes('-----end-----') || exist.includes('-&')) {
      return;
    }
    // sách dữ liệu
    lisRef.current.push(formatStringToObject(string));
  };
  // FORMAT data
  function formatStringToObject(text: any) {
    const exist = text.split(' ').filter((item: any) => item.trim().length > 0);
    if (
      exist.includes('print') ||
      exist.includes('date') ||
      exist.includes('-----end-----') ||
      exist.includes('-&')
    ) {
      return null;
    }
    const longlat = exist[3].trim().split(',');
    return {
      stt: exist[0],
      date: exist[1],
      time: exist[2],
      lat: longlat[0],
      long: longlat[1],
    };
  }

  const handleDiscoverPeripheral = (peripheral: Peripheral) => {
    console.debug('[handleDiscoverPeripheral] new BLE peripheral=', peripheral);
    if (!peripheral.name) {
      peripheral.name = 'NO NAME';
    }
    setPeripherals(map => {
      return new Map(map.set(peripheral.id, peripheral));
    });
  };

  const togglePeripheralConnection = async (peripheral: Peripheral) => {
    if (peripheral && peripheral.connected) {
      try {
        await BleManager.disconnect(peripheral.id);
      } catch (error) {
        console.error(
          `[togglePeripheralConnection][${peripheral.id}] error when trying to disconnect device.`,
          error,
        );
      }
    } else {
      await connectPeripheral(peripheral);
    }
  };

  const retrieveConnected = async () => {
    try {
      const connectedPeripherals = await BleManager.getConnectedPeripherals();
      if (connectedPeripherals.length === 0) {
        console.warn('[retrieveConnected] No connected peripherals found.');
        return;
      }

      console.debug(
        '[retrieveConnected] connectedPeripherals',
        connectedPeripherals,
      );

      for (const peripheral of connectedPeripherals) {
        setPeripherals(map => {
          const p = map.get(peripheral.id);
          if (p) {
            p.connected = true;
            return new Map(map.set(p.id, p));
          }
          return map;
        });
      }
    } catch (error) {
      console.error(
        '[retrieveConnected] unable to retrieve connected peripherals.',
        error,
      );
    }
  };

  const getAssociatedPeripherals = async () => {
    try {
      // const associatedPeripherals = await BleManager.getAssociatedPeripherals();
      const associatedPeripherals = await BleManager.getConnectedPeripherals();
      if (associatedPeripherals.length === 0) {
        console.warn('[retrieveConnected] No connected peripherals found.');
        startCompanionScan();
        return;
      }

      if (associatedPeripherals.length > 0) {
        console.log('associatedPeripherals[0]: ', associatedPeripherals[0]);
        setBlueInfo({
          ...blueInfo,
          serialnumber: associatedPeripherals[0].id,
          deviceName: associatedPeripherals[0].name,
          deviceId: associatedPeripherals[0].id,
        });
        // gọi lấy thông tin dữ liệu
        const buffer = Buffer.from(
          new Uint8Array(toArrayBuffer(Buffer.from(Buffer.from('#100;')))),
        );
        const regularArr = Array.from(buffer);
        const writeWithoutResponse = await BleManager.writeWithoutResponse(
          blueInfo.deviceId,
          blueInfo.serviceUUID,
          blueInfo.writeUUID,
          regularArr,
        );

        console.log('writeWithoutResponse: ', writeWithoutResponse);
      }
      for (const peripheral of associatedPeripherals) {
        setPeripherals(map => {
          return new Map(map.set(peripheral.id, peripheral));
        });
      }
    } catch (error) {
      console.error(
        '[getAssociatedPeripherals] unable to retrieve associated peripherals.',
        error,
      );
    }
  };

  function toArrayBuffer(buffer: Buffer) {
    const arrayBuffer = new ArrayBuffer(buffer.length);
    const view = new Uint8Array(arrayBuffer);
    for (let i = 0; i < buffer.length; ++i) {
      view[i] = buffer[i];
    }
    return arrayBuffer;
  }

  const connectPeripheral = async (peripheral: Peripheral) => {
    try {
      if (peripheral) {
        setPeripherals(map => {
          const p = map.get(peripheral.id);
          if (p) {
            p.connecting = true;
            return new Map(map.set(p.id, p));
          }
          return map;
        });

        await BleManager.connect(peripheral.id);
        console.debug(`[connectPeripheral][${peripheral.id}] connected.`);

        setPeripherals(map => {
          const p = map.get(peripheral.id);
          if (p) {
            p.connecting = false;
            p.connected = true;
            return new Map(map.set(p.id, p));
          }
          return map;
        });

        // before retrieving services, it is often a good idea to let bonding & connection finish properly
        await sleep(900);

        /* Test read current RSSI value, retrieve services first */
        const peripheralData = await BleManager.retrieveServices(peripheral.id);
        console.debug(
          `[connectPeripheral][${peripheral.id}] retrieved peripheral services`,
          peripheralData,
        );

        setPeripherals(map => {
          const p = map.get(peripheral.id);
          if (p) {
            return new Map(map.set(p.id, p));
          }
          return map;
        });

        const rssi = await BleManager.readRSSI(peripheral.id);
        console.debug(
          `[connectPeripheral][${peripheral.id}] retrieved current RSSI value: ${rssi}.`,
        );

        if (peripheralData.characteristics) {
          for (const characteristic of peripheralData.characteristics) {
            const serviceUUID = characteristic.service;
            const charUUID = characteristic.characteristic;
            console.log('serviceUUID: ', serviceUUID);
            console.log('charUUID: ', charUUID);
            console.log('characteristic: ', characteristic);
            // const blue = await BleManager.writeWithoutResponse()
            // if (characteristic.descriptors) {
            //   for (let descriptor of characteristic.descriptors) {
            //     try {
            //       let data = await BleManager.readDescriptor(
            //         peripheral.id,
            //         characteristic.service,
            //         characteristic.characteristic,
            //         descriptor.uuid,
            //       );
            //       console.debug(
            //         `[connectPeripheral][${peripheral.id}] ${characteristic.service} ${characteristic.characteristic} ${descriptor.uuid} descriptor read as:`,
            //         data,
            //       );
            //     } catch (error) {
            //       console.error(
            //         `[connectPeripheral][${peripheral.id}] failed to retrieve descriptor ${descriptor} for characteristic ${characteristic}:`,
            //         error,
            //       );
            //     }
            //   }
            // }
          }
        }

        setPeripherals(map => {
          const p = map.get(peripheral.id);
          if (p) {
            p.rssi = rssi;
            return new Map(map.set(p.id, p));
          }
          return map;
        });

        // navigation.navigate('PeripheralDetails', {
        //   peripheralData: peripheralData,
        // });
      }
    } catch (error) {
      console.error(
        `[connectPeripheral][${peripheral.id}] connectPeripheral error`,
        error,
      );
    }
  };

  function sleep(ms: number) {
    return new Promise<void>(resolve => setTimeout(resolve, ms));
  }

  useEffect(() => {
    try {
      BleManager.start({showAlert: false})
        .then(() => console.debug('BleManager started.'))
        .catch((error: any) =>
          console.error('BeManager could not be started.', error),
        );
    } catch (error) {
      console.error('unexpected error starting BleManager.', error);
      return;
    }

    const listeners = [
      bleManagerEmitter.addListener(
        'BleManagerDiscoverPeripheral',
        handleDiscoverPeripheral,
      ),
      bleManagerEmitter.addListener('BleManagerStopScan', handleStopScan),
      bleManagerEmitter.addListener(
        'BleManagerDisconnectPeripheral',
        handleDisconnectedPeripheral,
      ),
      bleManagerEmitter.addListener(
        'BleManagerDidUpdateValueForCharacteristic',
        handleUpdateValueForCharacteristic,
      ),
      bleManagerEmitter.addListener(
        'BleManagerConnectPeripheral',
        handleConnectPeripheral,
      ),
    ];

    handleAndroidPermissions();
    return () => {
      console.debug('[app] main component unmounting. Removing listeners...');
      for (const listener of listeners) {
        listener.remove();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleAndroidPermissions = () => {
    if (Platform.OS === 'android' && Platform.Version >= 31) {
      PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
      ]).then(result => {
        if (result) {
          console.debug(
            '[handleAndroidPermissions] User accepts runtime permissions android 12+',
          );
        } else {
          console.error(
            '[handleAndroidPermissions] User refuses runtime permissions android 12+',
          );
        }
      });
    } else if (Platform.OS === 'android' && Platform.Version >= 23) {
      PermissionsAndroid.check(
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      ).then(checkResult => {
        if (checkResult) {
          console.debug(
            '[handleAndroidPermissions] runtime permission Android <12 already OK',
          );
        } else {
          PermissionsAndroid.request(
            PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
          ).then(requestResult => {
            if (requestResult) {
              console.debug(
                '[handleAndroidPermissions] User accepts runtime permission android <12',
              );
            } else {
              console.error(
                '[handleAndroidPermissions] User refuses runtime permission android <12',
              );
            }
          });
        }
      });
    }
  };

  const renderItem = ({item}: {item: Peripheral}) => {
    const backgroundColor = item.connected ? '#069400' : Colors.white;
    return (
      <TouchableHighlight
        underlayColor="#0082FC"
        onPress={() => togglePeripheralConnection(item)}>
        <View style={[styles.row, {backgroundColor}]}>
          <Text style={styles.peripheralName}>
            {/* completeLocalName (item.name) & shortAdvertisingName (advertising.localName) may not always be the same */}
            {item.name} - {item?.advertising?.localName}
            {item.connecting && ' - Connecting...'}
          </Text>
          <Text style={styles.rssi}>RSSI: {item.rssi}</Text>
          <Text style={styles.peripheralId}>{item.id}</Text>
        </View>
      </TouchableHighlight>
    );
  };

  return (
    <>
      <StatusBar />
      <SafeAreaView style={styles.body}>
        {Platform.OS === 'android' && (
          <>
            <View style={styles.buttonGroup}>
              {/* <Pressable style={styles.scanButton} onPress={startCompanionScan}>
                <Text style={styles.scanButtonText}>Scan Companion</Text>
              </Pressable> */}

              <Pressable
                style={styles.scanButton}
                onPress={getAssociatedPeripherals}>
                <Text style={styles.scanButtonText}>Connect to Devices</Text>
              </Pressable>
            </View>
            <View style={styles.buttonGroup}>
              {/* <Pressable style={styles.scanButton} onPress={startScan}>
                <Text style={styles.scanButtonText}>
                  {isScanning ? 'Scanning...' : 'Scan Bluetooth'}
                </Text>
              </Pressable> */}

              <Pressable style={styles.scanButton} onPress={sendToDevice}>
                <Text style={styles.scanButtonText} lineBreakMode="middle">
                  Send Info
                </Text>
              </Pressable>
            </View>
            <View style={styles.buttonGroup}>
              <Pressable style={styles.scanButton} onPress={enableBluetooth}>
                <Text style={styles.scanButtonText}>Enable Bluetooh</Text>
              </Pressable>
            </View>
          </>
        )}

        {Array.from(peripherals.values()).length === 0 && (
          <View style={styles.row}>
            <Text style={styles.noPeripherals}>
              No Peripherals, press "Scan Bluetooth" above.
            </Text>
          </View>
        )}

        <FlatList
          data={Array.from(peripherals.values())}
          contentContainerStyle={{rowGap: 12}}
          renderItem={renderItem}
          keyExtractor={item => item.id}
        />
      </SafeAreaView>
    </>
  );
};

const styles = StyleSheet.create({
  engine: {
    position: 'absolute',
    right: 10,
    bottom: 0,
    color: Colors.black,
  },
  buttonGroup: {
    flexDirection: 'row',
    width: '100%',
  },
  scanButton: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 16,
    backgroundColor: '#0a398a',
    margin: 10,
    borderRadius: 12,
    flex: 1,
    // ...boxShadow,
  },
  scanButtonText: {
    fontSize: 16,
    letterSpacing: 0.25,
    color: Colors.white,
  },
  body: {
    backgroundColor: '#0082FC',
    flex: 1,
  },
  sectionContainer: {
    marginTop: 32,
    paddingHorizontal: 24,
  },
  sectionTitle: {
    fontSize: 24,
    fontWeight: '600',
    color: Colors.black,
  },
  sectionDescription: {
    marginTop: 8,
    fontSize: 18,
    fontWeight: '400',
    color: Colors.dark,
  },
  highlight: {
    fontWeight: '700',
  },
  footer: {
    color: Colors.dark,
    fontSize: 12,
    fontWeight: '600',
    padding: 4,
    paddingRight: 12,
    textAlign: 'right',
  },
  peripheralName: {
    fontSize: 16,
    textAlign: 'center',
    padding: 10,
  },
  rssi: {
    fontSize: 12,
    textAlign: 'center',
    padding: 2,
  },
  peripheralId: {
    fontSize: 12,
    textAlign: 'center',
    padding: 2,
    paddingBottom: 20,
  },
  row: {
    marginLeft: 10,
    marginRight: 10,
    borderRadius: 20,
    // ...boxShadow,
  },
  noPeripherals: {
    margin: 10,
    textAlign: 'center',
    color: Colors.white,
  },
});

export default ScanDevicesScreen;
