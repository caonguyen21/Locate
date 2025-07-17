/**
 * APP LOCATE - Ứng dụng lưu và kiểm tra vị trí GPS
 * Kiến trúc đơn giản: Native module chỉ trả về lat/lon, tất cả logic ở JavaScript
 */

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
  ActivityIndicator,
  StatusBar,
  NativeModules,
  Platform,
  ToastAndroid,
} from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import Dialog from 'react-native-dialog';
import debounce from 'lodash/debounce';
import Share from 'react-native-share';

// Import database functions
import {
  initializeDatabase,
  addLocation,
  fetchLocations,
  deleteLocation,
} from './sqlite';

// Native module chỉ cung cấp latitude và longitude
const {HighAccuracyLocation} = NativeModules;

const App = () => {
  // ===== STATE MANAGEMENT =====
  // Danh sách vị trí đã lưu từ database
  const [savedLocations, setSavedLocations] = useState([]);
  // Dialog thêm vị trí mới
  const [isAddDialogVisible, setIsAddDialogVisible] = useState(false);
  // Tên vị trí nhập từ user
  const [newLocationName, setNewLocationName] = useState('');
  // Trạng thái loading cho các thao tác async
  const [isProcessing, setIsProcessing] = useState(false);
  // Trạng thái refresh pull-to-refresh
  const [isRefreshing, setIsRefreshing] = useState(false);

  // ===== UTILITY FUNCTIONS =====
  /**
   * Hiển thị thông báo lỗi dưới dạng Alert
   */
  const displayErrorAlert = (title, message) => {
    Alert.alert(title, message);
    console.error(`${title}: ${message}`);
  };

  /**
   * Hiển thị thông báo thành công (Toast cho Android, Alert cho iOS)
   */
  const displaySuccessMessage = message => {
    if (Platform.OS === 'android') {
      ToastAndroid.show(message, ToastAndroid.SHORT);
    } else {
      Alert.alert('Thông tin', message);
    }
  };

  // ===== LIFECYCLE HOOKS =====
  /**
   * Khởi tạo app khi component mount
   */
  useEffect(() => {
    initializeAppData();
  }, []);

  /**
   * Cleanup debounced function khi component unmount
   */
  useEffect(() => {
    return () => {
      debouncedCheckLocation.cancel();
    };
  }, [debouncedCheckLocation]);

  // ===== DATABASE OPERATIONS =====
  /**
   * Khởi tạo database và load dữ liệu ban đầu
   */
  const initializeAppData = async () => {
    setIsProcessing(true);
    try {
      await initializeDatabase(); // Tạo tables nếu chưa có
      await loadSavedLocations(); // Load danh sách vị trí
    } catch (error) {
      displayErrorAlert('Lỗi khởi tạo', 'Không thể khởi tạo ứng dụng');
    } finally {
      setIsProcessing(false);
    }
  };

  /**
   * Lấy danh sách vị trí từ database và cập nhật state
   */
  const loadSavedLocations = useCallback(async () => {
    try {
      const locationData = await fetchLocations();
      setSavedLocations(locationData);
    } catch (error) {
      displayErrorAlert('Lỗi tải dữ liệu', 'Không thể tải danh sách vị trí');
    }
  }, []);

  /**
   * Xử lý pull-to-refresh để tải lại danh sách
   */
  const handleRefreshLocationList = useCallback(async () => {
    setIsRefreshing(true);
    await loadSavedLocations();
    setIsRefreshing(false);
  }, [loadSavedLocations]);

  // ===== PERMISSION MANAGEMENT =====
  /**
   * Yêu cầu quyền truy cập vị trí từ user
   * Chỉ cần ACCESS_FINE_LOCATION cho GPS chính xác
   */
  const requestLocationAccess = useCallback(async () => {
    try {
      const permissionResult = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        {
          title: 'Yêu cầu quyền vị trí',
          message:
            'Locate cần quyền truy cập vị trí để cung cấp dịch vụ định vị chính xác.',
          buttonNeutral: 'Hỏi sau',
          buttonNegative: 'Hủy',
          buttonPositive: 'Cấp quyền',
        },
      );
      return permissionResult === PermissionsAndroid.RESULTS.GRANTED;
    } catch (error) {
      displayErrorAlert('Lỗi quyền truy cập', 'Không thể yêu cầu quyền vị trí');
      return false;
    }
  }, []);

  // ===== LOCATION SERVICES =====
  /**
   * Lấy vị trí hiện tại từ native module
   * Native module xử lý GPS prioritization và chỉ trả về lat/lon
   */
  const getCurrentLocation = useCallback(async () => {
    try {
      const locationResult =
        await HighAccuracyLocation.getHighAccuracyPosition();
      // Native module đã được đơn giản hóa chỉ trả về tọa độ
      return {
        latitude: locationResult.latitude,
        longitude: locationResult.longitude,
      };
    } catch (error) {
      throw new Error(error.message || 'Không thể lấy vị trí');
    }
  }, []);

  /**
   * Tính khoảng cách giữa 2 điểm theo công thức Haversine
   * @param {number} lat1, lon1 - Tọa độ điểm 1
   * @param {number} lat2, lon2 - Tọa độ điểm 2
   * @returns {number} Khoảng cách tính bằng mét
   */
  const calculateDistanceBetweenPoints = useCallback(
    (lat1, lon1, lat2, lon2) => {
      const EARTH_RADIUS_METERS = 6371e3; // Bán kính Trái Đất tính bằng mét
      const lat1Rad = (lat1 * Math.PI) / 180; // Chuyển độ sang radian
      const lat2Rad = (lat2 * Math.PI) / 180;
      const deltaLatRad = ((lat2 - lat1) * Math.PI) / 180;
      const deltaLonRad = ((lon2 - lon1) * Math.PI) / 180;

      const haversineFormula =
        Math.sin(deltaLatRad / 2) * Math.sin(deltaLatRad / 2) +
        Math.cos(lat1Rad) *
          Math.cos(lat2Rad) *
          Math.sin(deltaLonRad / 2) *
          Math.sin(deltaLonRad / 2);
      return (
        EARTH_RADIUS_METERS *
        2 *
        Math.atan2(Math.sqrt(haversineFormula), Math.sqrt(1 - haversineFormula))
      );
    },
    [],
  );

  // ===== LOCATION OPERATIONS =====
  /**
   * Mở dialog để thêm vị trí mới
   */
  const showAddLocationDialog = useCallback(
    () => setIsAddDialogVisible(true),
    [],
  );

  /**
   * Đóng dialog và reset form
   */
  const hideAddLocationDialog = useCallback(() => {
    setIsAddDialogVisible(false);
    setNewLocationName('');
  }, []);

  /**
   * Xử lý lưu vị trí mới vào database
   * Flow: Validate input -> Request permission -> Get location -> Save to DB
   */
  const saveNewLocation = useCallback(async () => {
    // Validate input
    if (!newLocationName.trim()) {
      displayErrorAlert('Lỗi xác thực', 'Vui lòng nhập tên vị trí');
      return;
    }

    // Request permission
    if (!(await requestLocationAccess())) {
      displayErrorAlert(
        'Lỗi quyền truy cập',
        'Cần quyền vị trí để lưu vị trí của bạn',
      );
      return;
    }

    setIsAddDialogVisible(false);
    setIsProcessing(true);

    try {
      // Get current location from native module
      const currentPosition = await getCurrentLocation();
      const {latitude, longitude} = currentPosition;
      console.log(`Saving location: lat=${latitude}, lon=${longitude}`);

      // Save to database with current timestamp
      const currentTimestamp = new Date().toISOString();
      await addLocation(
        latitude,
        longitude,
        currentTimestamp,
        newLocationName.trim(),
      );

      // Refresh locations list
      await loadSavedLocations();
      setNewLocationName('');

      displaySuccessMessage(`📍 Đã lưu vị trí "${newLocationName.trim()}"!`);
    } catch (error) {
      console.error('Failed to add location:', error);
      displayErrorAlert(
        'Lỗi vị trí',
        error.message || 'Không thể lấy vị trí hiện tại',
      );
    } finally {
      setIsProcessing(false);
    }
  }, [
    newLocationName,
    requestLocationAccess,
    getCurrentLocation,
    loadSavedLocations,
    displaySuccessMessage,
  ]);

  /**
   * Kiểm tra vị trí hiện tại với các vị trí đã lưu
   * Tìm vị trí gần nhất và thông báo kết quả
   */
  const checkCurrentLocationAgainstSaved = useCallback(async () => {
    if (!(await requestLocationAccess())) {
      displayErrorAlert(
        'Lỗi quyền truy cập',
        'Cần quyền vị trí để kiểm tra vị trí của bạn',
      );
      return;
    }

    setIsProcessing(true);

    try {
      // Get current location
      const currentPosition = await getCurrentLocation();
      const {latitude, longitude} = currentPosition;
      console.log(`Check location: lat=${latitude}, lon=${longitude}`);

      // Find closest saved location
      const DISTANCE_THRESHOLD_METERS = 20;
      const closestLocation = savedLocations.reduce(
        (accumulator, savedLocation) => {
          const distanceToSaved = calculateDistanceBetweenPoints(
            latitude,
            longitude,
            savedLocation.latitude,
            savedLocation.longitude,
          );
          return distanceToSaved < accumulator.distance
            ? {location: savedLocation, distance: distanceToSaved}
            : accumulator;
        },
        {distance: Infinity}, // Initial value with infinite distance
      );

      // Check if within threshold
      if (closestLocation.distance <= DISTANCE_THRESHOLD_METERS) {
        Alert.alert(
          'Vị trí khớp ✅',
          `📍 Tìm thấy: ${
            closestLocation.location.name
          }\n📏 Khoảng cách: ${closestLocation.distance.toFixed(
            1,
          )}m\n🗺️ Tọa độ: ${latitude.toFixed(6)}, ${longitude.toFixed(6)}`,
        );
      } else {
        Alert.alert(
          'Vị trí không khớp ❌',
          `📍 Gần nhất: ${
            closestLocation.location?.name || 'Không có'
          }\n📏 Khoảng cách: ${closestLocation.distance.toFixed(
            1,
          )}m\n🗺️ Tọa độ: ${latitude.toFixed(6)}, ${longitude.toFixed(6)}`,
        );
      }
    } catch (error) {
      console.error('Failed to check location:', error);
      displayErrorAlert(
        'Lỗi vị trí',
        error.message || 'Không thể lấy vị trí hiện tại',
      );
    } finally {
      setIsProcessing(false);
    }
  }, [
    savedLocations,
    requestLocationAccess,
    getCurrentLocation,
    calculateDistanceBetweenPoints,
  ]);

  /**
   * Debounced version của checkLocation để tránh spam
   */
  const debouncedCheckLocation = useMemo(
    () => debounce(checkCurrentLocationAgainstSaved, 1000),
    [checkCurrentLocationAgainstSaved],
  );

  /**
   * Xử lý xóa vị trí với confirmation dialog
   */
  const confirmAndDeleteLocation = useCallback(
    locationId =>
      Alert.alert('Xóa vị trí', 'Bạn có chắc chắn muốn xóa vị trí này không?', [
        {text: 'Hủy', style: 'cancel'},
        {
          text: 'Xóa',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteLocation(locationId);
              await loadSavedLocations(); // Refresh list after delete
            } catch (error) {
              displayErrorAlert('Lỗi xóa', 'Không thể xóa vị trí');
            }
          },
        },
      ]),
    [loadSavedLocations],
  );

  // ===== SHARING FUNCTIONALITY =====
  /**
   * Chia sẻ danh sách vị trí dưới dạng text
   * Format: Tên, tọa độ, thời gian, Google Maps link
   */
  const shareLocationList = useCallback(async () => {
    if (savedLocations.length === 0) {
      displayErrorAlert('Không có dữ liệu', 'Không có vị trí nào để chia sẻ');
      return;
    }

    try {
      // Format locations data for sharing
      const formattedLocationList = savedLocations
        .map(
          (savedLocation, index) =>
            `📍 Vị trí ${index + 1}: ${savedLocation.name}\n` +
            `🌍 Tọa độ: ${savedLocation.latitude.toFixed(
              6,
            )}, ${savedLocation.longitude.toFixed(6)}\n` +
            `🕐 Thời gian: ${new Date(savedLocation.timestamp).toLocaleString(
              'vi-VN',
              {
                hour: '2-digit',
                minute: '2-digit',
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
              },
            )}\n` +
            `🗺️ Google Maps: https://maps.google.com/?q=${savedLocation.latitude},${savedLocation.longitude}\n\n`,
        )
        .join('');

      const shareContent = `📍 Các vị trí đã lưu của tôi (${savedLocations.length} tổng cộng)\n\n${formattedLocationList}Chia sẻ từ ứng dụng Locate 🚀`;

      // Share using react-native-share
      await Share.open({
        title: 'Chia sẻ vị trí của tôi',
        message: shareContent,
        subject: `${savedLocations.length} vị trí đã lưu của tôi`,
      });

      displaySuccessMessage('✅ Đã chia sẻ vị trí thành công!');
    } catch (error) {
      // Check if user cancelled sharing (not an actual error)
      const isUserCancelled =
        (error.message &&
          (error.message.toLowerCase().includes('user did not share') ||
            error.message.toLowerCase().includes('cancelled') ||
            error.message.toLowerCase().includes('cancel') ||
            error.message.toLowerCase().includes('dismiss') ||
            error.message.toLowerCase().includes('result_canceled'))) ||
        error.code === 'userCancel' ||
        error.code === 'CANCELLED' ||
        error.code === 'cancelled' ||
        error.dismissedAction === true ||
        error.activityResult === 'dismissed';

      if (isUserCancelled) {
        // User cancelled - return silently
        return;
      }

      // Only show error for actual failures
      console.error('Share error:', error);
      displayErrorAlert(
        'Lỗi chia sẻ',
        'Không thể chia sẻ vị trí. Vui lòng thử lại.',
      );
    }
  }, [savedLocations, displaySuccessMessage]);

  // ===== RENDER FUNCTIONS =====
  /**
   * Render từng item trong FlatList
   * Hiển thị: tên, tọa độ, thời gian
   * Hành động: tap = chi tiết, long press = xóa
   */
  const renderLocationItem = useCallback(
    ({item: locationItem}) => {
      const formattedTimestamp = new Date(
        locationItem.timestamp,
      ).toLocaleString('vi-VN', {
        hour: '2-digit',
        minute: '2-digit',
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      });

      return (
        <TouchableOpacity
          style={styles.item}
          onLongPress={() => confirmAndDeleteLocation(locationItem.id)}
          onPress={() => {
            // Show detailed info dialog
            Alert.alert(
              `📍 ${locationItem.name}`,
              `🌍 Tọa độ: ${locationItem.latitude.toFixed(
                6,
              )}, ${locationItem.longitude.toFixed(6)}\n` +
                `🕐 Thời gian lưu: ${formattedTimestamp}\n` +
                `\nBạn có muốn xem trên Google Maps không?`,
              [
                {text: 'Đóng', style: 'cancel'},
                {
                  text: 'Xem Maps',
                  onPress: () => {
                    const googleMapsUrl = `https://maps.google.com/?q=${locationItem.latitude},${locationItem.longitude}`;
                    import('react-native').then(({Linking}) => {
                      Linking.openURL(googleMapsUrl).catch(err =>
                        console.error('Không thể mở Maps:', err),
                      );
                    });
                  },
                },
                {
                  text: 'Sao chép tọa độ',
                  onPress: () => {
                    import('react-native').then(({Clipboard}) => {
                      Clipboard.setString(
                        `${locationItem.latitude.toFixed(
                          6,
                        )}, ${locationItem.longitude.toFixed(6)}`,
                      );
                      displaySuccessMessage('📋 Đã sao chép tọa độ!');
                    });
                  },
                },
              ],
            );
          }}>
          <View style={styles.card}>
            <Text style={styles.name}>{locationItem.name}</Text>
            <Text style={styles.coords}>
              🌍 Vĩ độ: {locationItem.latitude.toFixed(6)}
            </Text>
            <Text style={styles.coords}>
              🌍 Kinh độ: {locationItem.longitude.toFixed(6)}
            </Text>
            <Text style={styles.timestamp}>🕐 {formattedTimestamp}</Text>
            <Text style={styles.hint}>Nhấn để xem chi tiết • Giữ để xóa</Text>
          </View>
        </TouchableOpacity>
      );
    },
    [confirmAndDeleteLocation, displaySuccessMessage],
  );

  /**
   * Render empty state khi chưa có vị trí nào
   */
  const renderEmptyLocationList = useCallback(
    () => (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>Chưa có vị trí nào được lưu</Text>
        <Text style={styles.emptySubText}>Nhấn nút + để thêm vị trí!</Text>
      </View>
    ),
    [],
  );

  // ===== MAIN RENDER =====
  return (
    <SafeAreaView style={styles.container}>
      <StatusBar backgroundColor="#2E7D32" barStyle="light-content" />

      {/* Header Section */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>📍 Locate</Text>
        <Text style={styles.headerSubtitle}>Theo dõi GPS độ chính xác cao</Text>
      </View>

      {/* Loading Overlay - hiển thị khi đang xử lý */}
      {isProcessing && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#FFF" />
        </View>
      )}

      {/* Main List - hiển thị danh sách vị trí đã lưu */}
      <FlatList
        data={savedLocations}
        keyExtractor={locationItem => locationItem.id.toString()}
        renderItem={renderLocationItem}
        ListEmptyComponent={renderEmptyLocationList}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefreshLocationList}
            colors={['#2E7D32']}
            tintColor="#2E7D32"
          />
        }
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      />

      {/* Floating Action Buttons */}
      {/* Check Location Button - kiểm tra vị trí hiện tại */}
      <TouchableOpacity
        style={[
          styles.fabButton,
          styles.checkButton,
          isProcessing && styles.disabled,
        ]}
        onPress={debouncedCheckLocation}
        disabled={isProcessing}
        activeOpacity={0.8}>
        <Icon name="search" size={24} color="#FFF" />
      </TouchableOpacity>

      {/* Add Location Button - thêm vị trí mới */}
      <TouchableOpacity
        style={[
          styles.fabButton,
          styles.addButton,
          isProcessing && styles.disabled,
        ]}
        onPress={showAddLocationDialog}
        disabled={isProcessing}
        activeOpacity={0.8}>
        <Icon name="plus" size={24} color="#FFF" />
      </TouchableOpacity>

      {/* Share Button - chia sẻ danh sách vị trí */}
      <TouchableOpacity
        style={[
          styles.fabButton,
          styles.shareButton,
          isProcessing && styles.disabled,
        ]}
        onPress={shareLocationList}
        disabled={isProcessing}
        activeOpacity={0.8}>
        <Icon name="share" size={20} color="#FFF" />
      </TouchableOpacity>

      {/* Add Location Dialog */}
      <Dialog.Container visible={isAddDialogVisible}>
        <Dialog.Title>
          <Text style={styles.dialogTitle}>📍 Thêm vị trí mới</Text>
        </Dialog.Title>
        <Dialog.Description>
          Nhập tên cho vị trí này. Vị trí GPS hiện tại của bạn sẽ được lưu.
        </Dialog.Description>
        <Dialog.Input
          placeholder="vd: Nhà, Văn phòng, Công viên..."
          value={newLocationName}
          onChangeText={setNewLocationName}
          autoFocus
        />
        <Dialog.Button label="Hủy" onPress={hideAddLocationDialog} />
        <Dialog.Button
          label="Lưu vị trí"
          onPress={saveNewLocation}
          disabled={isProcessing}
        />
      </Dialog.Container>
    </SafeAreaView>
  );
};

// ===== STYLES =====
const styles = StyleSheet.create({
  // Container & Layout
  container: {
    flex: 1,
    backgroundColor: '#F8FAFB',
  },

  // Header Styles
  header: {
    backgroundColor: '#2E7D32',
    paddingVertical: 20,
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'android' ? 40 : 20,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 5,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#FFF',
    textAlign: 'center',
  },
  headerSubtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.8)',
    textAlign: 'center',
    marginTop: 4,
  },

  // List Styles
  listContent: {
    paddingBottom: 120, // Space for FABs
    paddingTop: 10,
  },
  item: {
    marginVertical: 6,
    marginHorizontal: 16,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
    borderWidth: 1,
    borderColor: '#F0F0F0',
  },

  // Text Styles
  name: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1A1A1A',
    marginBottom: 8,
  },
  coords: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
  timestamp: {
    fontSize: 12,
    color: '#999',
    marginBottom: 4,
  },
  hint: {
    fontSize: 11,
    color: '#BBB',
    fontStyle: 'italic',
    textAlign: 'center',
    marginTop: 4,
  },

  // Floating Action Buttons
  fabButton: {
    position: 'absolute',
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  checkButton: {
    backgroundColor: '#2E7D32', // Green - Check location
    bottom: 30,
    right: 20,
  },
  addButton: {
    backgroundColor: '#1976D2', // Blue - Add location
    bottom: 100,
    right: 20,
  },
  shareButton: {
    backgroundColor: '#FF6B35', // Orange - Share
    bottom: 170,
    right: 20,
  },
  disabled: {
    opacity: 0.5,
  },

  // Empty State
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

  // Loading Overlay
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },

  // Dialog
  dialogTitle: {
    fontSize: 20,
    fontWeight: '600',
  },
});

export default App;
