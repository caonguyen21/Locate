# 📍 Locate - Ứng dụng GPS độ chính xác cao> Ứng dụng React Native đơn giản và hiệu quả để lưu và kiểm tra vị trí GPS với độ chính xác cao## 🚀 Tính năng chính- **📍 Lưu vị trí GPS**: Lưu vị trí hiện tại với tên tùy chỉnh- **🔍 Kiểm tra vị trí**: So sánh vị trí hiện tại với các vị trí đã lưu- **📏 Tính khoảng cách**: Hiển thị khoảng cách chính xác giữa các điểm- **📤 Chia sẻ**: Chia sẻ danh sách vị trí với Google Maps links- **🗂️ Quản lý**: Xem, sửa, xóa các vị trí đã lưu- **🎯 Độ chính xác cao**: Native module tối ưu cho GPS chính xác## 🏗️ Kiến trúc### Thiết kế đơn giản & hiệu quả- **Native Module**: Chỉ xử lý lấy tọa độ GPS (lat/lon)- **JavaScript Logic**: Tất cả business logic, UI, và database- **SQLite Database**: Lưu trữ cục bộ nhanh chóng- **Clean Architecture**: Dễ maintain và extend```┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐│   React Native  │◄──►│  Native Module   │◄──►│   GPS/Network   ││   (App.js)      │    │ (Kotlin/Swift)   │    │   Providers     │└─────────────────┘    └──────────────────┘    └─────────────────┘         │         ▼┌─────────────────┐│ SQLite Database ││   (sqlite.js)   │└─────────────────┘```## 📱 Screenshots### Giao diện chính- **Danh sách vị trí**: Hiển thị tất cả vị trí đã lưu với thông tin chi tiết- **Floating Action Buttons**:   - 🔍 Kiểm tra vị trí hiện tại  - ➕ Thêm vị trí mới  - 📤 Chia sẻ danh sách### Thông tin hiển thị- **Tên vị trí**: Tên do người dùng đặt- **Tọa độ**: Latitude và Longitude (6 chữ số thập phân)- **Thời gian**: Thời điểm lưu vị trí- **Khoảng cách**: Khi kiểm tra vị trí hiện tại## 🛠️ Công nghệ sử dụng### Frontend- **React Native 0.78.0** - Cross-platform framework- **React Hooks** - Modern state management- **JavaScript ES6+** - Clean, modern code### Native- **Kotlin** (Android) - High-accuracy location module- **Android LocationManager** - GPS và Network providers- **Smart provider strategy** - GPS priority với Network fallback### Database- **SQLite** - Local storage- **Custom wrapper** - Optimized for location data### UI/UX- **react-native-vector-icons** - Beautiful icons- **react-native-dialog** - Native dialogs- **react-native-share** - Native sharing## 📋 Yêu cầu hệ thống### Development- **Node.js** >= 16- **React Native CLI**- **Android Studio** (cho Android)- **Xcode** (cho iOS)### Runtime- **Android** >= 6.0 (API 23)- **iOS** >= 11.0- **GPS/Location Services** enabled- **Storage** ~10MB## 🚀 Cài đặt và chạy### 1. Clone repository```bashgit clone https://github.com/caonguyen21/Locate.gitcd Locate```### 2. Cài đặt dependencies```bashnpm install```### 3. Chạy trên Android
```bash
npm run android
```

### 4. Chạy trên iOS
```bash
cd ios && pod install && cd ..
npm run ios
```

## 🎯 Cách sử dụng

### Thêm vị trí mới
1. Nhấn nút **➕** (xanh dương)
2. Nhập tên vị trí (VD: "Nhà", "Văn phòng")
3. Cấp quyền vị trí nếu được yêu cầu
4. Vị trí sẽ được lưu tự động

### Kiểm tra vị trí hiện tại
1. Nhấn nút **🔍** (xanh lá)
2. App sẽ lấy vị trí hiện tại
3. So sánh với tất cả vị trí đã lưu
4. Hiển thị vị trí gần nhất và khoảng cách

### Quản lý vị trí
- **Xem chi tiết**: Nhấn vào item
- **Sao chép tọa độ**: Nhấn "Sao chép tọa độ" trong dialog
- **Mở Google Maps**: Nhấn "Xem Maps" trong dialog
- **Xóa vị trí**: Giữ lâu item và xác nhận

### Chia sẻ vị trí
1. Nhấn nút **📤** (cam)
2. Chọn ứng dụng để chia sẻ
3. Danh sách sẽ include Google Maps links

## ⚙️ Cấu hình

### Native Module Settings
```kotlin
// HighAccuracyLocationModule.kt
companion object {
    private const val LOCATION_TIMEOUT = 15000L        // 15 giây
    private const val GPS_UPDATE_INTERVAL = 1000L      // 1 giây
    private const val NETWORK_UPDATE_INTERVAL = 2000L  // 2 giây
    private const val NETWORK_FALLBACK_DELAY = 5000L   // 5 giây
    private const val GPS_GOOD_ACCURACY_THRESHOLD = 20f     // 20 mét
    private const val NETWORK_ACCEPTABLE_ACCURACY = 50f     // 50 mét
}
```

### Distance Threshold
```javascript
// App.js
const DISTANCE_THRESHOLD_METERS = 20; // Ngưỡng coi là "khớp vị trí"
```

## 🔧 Customization

### Thay đổi độ chính xác
Chỉnh sửa constants trong `HighAccuracyLocationModule.kt`:
- `GPS_GOOD_ACCURACY_THRESHOLD`: Độ chính xác GPS mong muốn
- `NETWORK_ACCEPTABLE_ACCURACY`: Độ chính xác Network chấp nhận được

### Thay đổi ngưỡng khớp vị trí
Chỉnh sửa `DISTANCE_THRESHOLD_METERS` trong `App.js`

### Thêm fields mới
1. Cập nhật database schema trong `sqlite.js`
2. Cập nhật UI trong `App.js`
3. Native module không cần thay đổi

## 📊 Database Schema

```sql
CREATE TABLE IF NOT EXISTS locations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    latitude REAL NOT NULL,
    longitude REAL NOT NULL,
    timestamp TEXT NOT NULL,
    name TEXT NOT NULL
);
```

## 🛡️ Permissions

### Android
```xml
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
```

### iOS
```xml
<key>NSLocationWhenInUseUsageDescription</key>
<string>Locate cần quyền vị trí để lưu và kiểm tra các địa điểm.</string>
```

## 🐛 Troubleshooting

### Không lấy được vị trí
1. Kiểm tra GPS/Location Services đã bật
2. Kiểm tra quyền ứng dụng
3. Thử ở ngoài trời để có tín hiệu GPS tốt hơn

### Build errors
```bash
# Clean build
cd android && ./gradlew clean && cd ..
npm run android

# Reset Metro cache
npx react-native start --reset-cache
```

### Database issues
App sẽ tự động tạo lại database nếu có lỗi

## 🔄 Workflow Development

### Thêm tính năng mới
1. **Native changes**: Chỉ khi cần access platform-specific APIs
2. **Database changes**: Cập nhật `sqlite.js`
3. **UI changes**: Cập nhật `App.js`
4. **Testing**: Build và test trên device thật

### Performance optimization
- Native module đã optimize cho speed và accuracy
- Database operations are async
- UI sử dụng React.memo và useCallback để avoid re-renders

## 📈 Future Improvements

### Planned Features
- [ ] **Offline maps**: Hiển thị bản đồ offline
- [ ] **Export data**: Xuất ra CSV/JSON
- [ ] **Location history**: Theo dõi lịch sử di chuyển
- [ ] **Geofencing**: Cảnh báo khi vào/ra khỏi vùng
- [ ] **Multiple location types**: Phân loại vị trí

### Architecture Enhancements
- [ ] **TypeScript**: Convert sang TypeScript
- [ ] **State management**: Redux/Zustand cho complex state
- [ ] **Testing**: Unit tests và integration tests
- [ ] **CI/CD**: Automated testing và deployment

## 👥 Contributing

1. Fork repository
2. Tạo feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to branch (`git push origin feature/AmazingFeature`)
5. Mở Pull Request

### Code Style
- JavaScript ES6+ với Prettier formatting
- Kotlin với Android style guide
- Comments bằng tiếng Việt cho business logic

## 📄 License

Project này được phân phối dưới MIT License. Xem `LICENSE` file để biết thêm chi tiết.

## 👨‍💻 Author

**Cao Nguyen**
- GitHub: [@caonguyen21](https://github.com/caonguyen21)

## 🙏 Acknowledgments

- React Native team cho framework tuyệt vời
- Android LocationManager API
- Các thư viện open source được sử dụng trong project

---

## 📞 Support

Nếu bạn gặp vấn đề hoặc có câu hỏi:
1. Kiểm tra [Issues](https://github.com/caonguyen21/Locate/issues)
2. Tạo issue mới với mô tả chi tiết
3. Include logs và device information

**Made with ❤️ for accurate location tracking**
