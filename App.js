import React, {useState, useEffect, useCallback, useMemo} from 'react';
import {
  FlatList,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  Alert,
  View,
  RefreshControl,
  PermissionsAndroid,
  Platform,
  ActivityIndicator,
  StatusBar,
} from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import {
  initializeDatabase,
  addLocation,
  fetchLocations,
  deleteLocation,
} from './sqlite';
import Geolocation from '@react-native-community/geolocation';
import Dialog from 'react-native-dialog';
import debounce from 'lodash/debounce';
import Share from 'react-native-share';

const App = () => {
  const [locations, setLocations] = useState([]);
  const [dialogVisible, setDialogVisible] = useState(false);
  const [locationName, setLocationName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const showError = (title, message) => {
    Alert.alert(title, message);
    console.error(`${title}: ${message}`);
  };

  useEffect(() => {
    initializeApp();
  }, []);

  useEffect(() => {
    return () => {
      checkLocationDebounced.cancel();
    };
  }, [checkLocationDebounced]);

  const initializeApp = async () => {
    setIsLoading(true);
    try {
      await initializeDatabase();
      await fetchAndSetLocations();
    } catch (error) {
      showError('Error', 'Failed to initialize app');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchAndSetLocations = useCallback(async () => {
    try {
      const data = await fetchLocations();
      setLocations(data);
    } catch (error) {
      showError('Error', 'Failed to load locations');
    }
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchAndSetLocations();
    setRefreshing(false);
  }, [fetchAndSetLocations]);

  const requestLocationPermission = useCallback(async () => {
    if (Platform.OS === 'android') {
      try {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
          {
            title: 'Location Permission',
            message: 'This app needs access to your location.',
            buttonNeutral: 'Ask Me Later',
            buttonNegative: 'Cancel',
            buttonPositive: 'OK',
          },
        );
        return granted === PermissionsAndroid.RESULTS.GRANTED;
      } catch (error) {
        showError('Error', 'Failed to request location permission');
        return false;
      }
    }
    // For iOS, you might want to add specific permission handling
    return true;
  }, []);

  const requestStoragePermission = useCallback(async () => {
    if (Platform.OS !== 'android' || Platform.Version >= 30) return true;
    try {
      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE,
        {
          title: 'Storage Permission',
          message: 'This app needs access to storage to share data.',
          buttonNeutral: 'Ask Me Later',
          buttonNegative: 'Cancel',
          buttonPositive: 'OK',
        },
      );
      return granted === PermissionsAndroid.RESULTS.GRANTED;
    } catch (error) {
      showError('Error', 'Failed to request storage permission');
      return false;
    }
  }, []);

  const getCurrentPosition = useCallback(() => {
    return new Promise((resolve, reject) =>
      Geolocation.getCurrentPosition(
        pos => resolve(pos.coords),
        err => {
          switch (err.code) {
            case 1:
              reject(new Error('Location permission denied'));
              break;
            case 2:
              reject(new Error('Position unavailable'));
              break;
            case 3:
              reject(new Error('Location request timed out'));
              break;
            default:
              reject(err);
          }
        },
        {enableHighAccuracy: false, timeout: 10000, maximumAge: 0},
      ),
    );
  }, []);

  const addSampleLocation = useCallback(() => setDialogVisible(true), []);

  const handleAddLocation = useCallback(async () => {
    if (!locationName.trim()) {
      showError('Error', 'Location name cannot be empty');
      return;
    }
    if (!(await requestLocationPermission())) {
      showError('Error', 'Location permission denied');
      return;
    }

    setDialogVisible(false);
    setIsLoading(true);

    try {
      const {latitude, longitude} = await getCurrentPosition();
      const timestamp = new Date().toISOString();
      await addLocation(latitude, longitude, timestamp, locationName);
      await fetchAndSetLocations();
      setLocationName('');
    } catch (error) {
      showError('Error', `Unable to fetch GPS location: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  }, [locationName, requestLocationPermission, fetchAndSetLocations]);

  const handleCancelDialog = useCallback(() => {
    setDialogVisible(false);
    setLocationName('');
  }, []);

  const checkLocation = useCallback(async () => {
    if (!(await requestLocationPermission())) {
      showError('Error', 'Location permission denied');
      return;
    }

    setIsLoading(true);
    try {
      const {latitude, longitude, accuracy} = await getCurrentPosition();
      console.log('Current position accuracy (meters):', accuracy);

      const calculateDistance = (lat1, lon1, lat2, lon2) => {
        const R = 6371e3;
        const φ1 = (lat1 * Math.PI) / 180;
        const φ2 = (lat2 * Math.PI) / 180;
        const Δφ = ((lat2 - lat1) * Math.PI) / 180;
        const Δλ = ((lon2 - lon1) * Math.PI) / 180;
        const a =
          Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
          Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      };

      const closest = locations.reduce(
        (acc, item) => {
          const distance = calculateDistance(
            latitude,
            longitude,
            item.latitude,
            item.longitude,
          );
          return distance < acc.distance ? {item, distance} : acc;
        },
        {distance: Infinity},
      );

      if (closest.distance <= 20) {
        Alert.alert(
          'Location Matched',
          `Closest: ${closest.item.name}\nDistance: ${closest.distance.toFixed(
            2,
          )} meters`,
        );
      } else {
        Alert.alert(
          'Location Not Matched',
          `Nearest: ${
            closest.item?.name || 'None'
          }\nDistance: ${closest.distance.toFixed(2)} meters`,
        );
      }
    } catch (error) {
      showError('Error', `Unable to fetch GPS location: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  }, [locations, requestLocationPermission]);

  const checkLocationDebounced = useMemo(
    () => debounce(checkLocation, 1000),
    [checkLocation],
  );

  const handleDelete = useCallback(
    id =>
      Alert.alert(
        'Delete Location',
        'Are you sure you want to delete this location?',
        [
          {text: 'Cancel', style: 'cancel'},
          {
            text: 'Delete',
            style: 'destructive',
            onPress: async () => {
              try {
                await deleteLocation(id);
                await fetchAndSetLocations();
              } catch (error) {
                showError('Error', 'Failed to delete location');
              }
            },
          },
        ],
      ),
    [fetchAndSetLocations],
  );

  const handleShareLocations = useCallback(async () => {
    if (Platform.OS === 'android' && Platform.Version < 30) {
      if (!(await requestStoragePermission())) {
        showError('Error', 'Storage permission denied');
        return;
      }
    }

    try {
      const formattedLocations = locations
        .map(
          loc =>
            `Name: ${loc.name}\nLat: ${loc.latitude.toFixed(
              6,
            )}\nLon: ${loc.longitude.toFixed(6)}\nTimestamp: ${new Date(
              loc.timestamp,
            ).toLocaleString('en-GB', {
              hour: '2-digit',
              minute: '2-digit',
              day: '2-digit',
              month: 'short',
              year: 'numeric',
            })}\n\n`,
        )
        .join('');
      await Share.open({
        title: 'Share Locations',
        message: formattedLocations,
      });
    } catch (error) {
      showError('Error', 'Failed to share locations');
    }
  }, [locations, requestStoragePermission]);

  const renderItem = useCallback(
    ({item}) => {
      const formattedTimestamp = new Date(item.timestamp).toLocaleString(
        'en-GB',
        {
          hour: '2-digit',
          minute: '2-digit',
          day: '2-digit',
          month: 'short',
          year: 'numeric',
        },
      );

      return (
        <TouchableOpacity
          style={styles.item}
          onLongPress={() => handleDelete(item.id)}>
          <View style={styles.card}>
            <Text style={styles.name}>{item.name}</Text>
            <Text style={styles.coords}>Lat: {item.latitude.toFixed(6)}</Text>
            <Text style={styles.coords}>Lon: {item.longitude.toFixed(6)}</Text>
            <Text style={styles.timestamp}>{formattedTimestamp}</Text>
          </View>
        </TouchableOpacity>
      );
    },
    [handleDelete],
  );

  const renderEmptyList = useCallback(
    () => (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>No locations saved yet</Text>
        <Text style={styles.emptySubText}>Tap the + button to add one!</Text>
      </View>
    ),
    [],
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar hidden={true} />
      {isLoading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#007AFF" />
        </View>
      )}
      <FlatList
        data={locations}
        keyExtractor={item => item.id.toString()}
        renderItem={renderItem}
        ListEmptyComponent={renderEmptyList}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        contentContainerStyle={styles.listContent}
      />
      <TouchableOpacity
        style={[
          styles.button,
          styles.checkButton,
          isLoading && styles.disabled,
        ]}
        onPress={checkLocationDebounced}
        disabled={isLoading}
        activeOpacity={0.7}>
        <Icon name="search" size={28} color="#FFF" />
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.button, styles.addButton, isLoading && styles.disabled]}
        onPress={addSampleLocation}
        disabled={isLoading}
        activeOpacity={0.7}>
        <Icon name="plus" size={28} color="#FFF" />
      </TouchableOpacity>
      <TouchableOpacity
        style={[
          styles.button,
          styles.shareButton,
          isLoading && styles.disabled,
        ]}
        onPress={handleShareLocations}
        disabled={isLoading}
        activeOpacity={0.7}>
        <Icon name="share" size={28} color="#FFF" />
      </TouchableOpacity>
      <Dialog.Container visible={dialogVisible}>
        <Dialog.Title>
          <Text style={styles.dialogTitle}>Add Location</Text>
        </Dialog.Title>
        <Dialog.Input
          placeholder="Enter location name"
          value={locationName}
          onChangeText={setLocationName}
          autoFocus
        />
        <Dialog.Button label="Cancel" onPress={handleCancelDialog} />
        <Dialog.Button
          label="Save"
          onPress={handleAddLocation}
          disabled={isLoading}
        />
      </Dialog.Container>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    marginTop: 0,
    backgroundColor: '#F5F7FA',
  },
  listContent: {
    paddingBottom: 100,
  },
  item: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  card: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  name: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1A1A1A',
    marginBottom: 4,
  },
  coords: {
    fontSize: 14,
    color: '#4A4A4A',
    marginBottom: 2,
  },
  timestamp: {
    fontSize: 12,
    color: '#8E8E93',
  },
  button: {
    position: 'absolute',
    right: 16,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.2,
    shadowRadius: 6,
  },
  checkButton: {
    bottom: 80,
    backgroundColor: '#007AFF',
  },
  addButton: {
    bottom: 16,
    backgroundColor: '#34C759',
  },
  shareButton: {
    bottom: 144,
    backgroundColor: '#FF9500',
  },
  disabled: {
    opacity: 0.5,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    marginTop: 50,
  },
  emptyText: {
    fontSize: 18,
    color: '#4A4A4A',
    marginBottom: 8,
  },
  emptySubText: {
    fontSize: 14,
    color: '#8E8E93',
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  dialogTitle: {
    fontSize: 20,
    fontWeight: '600',
  },
});

export default App;
