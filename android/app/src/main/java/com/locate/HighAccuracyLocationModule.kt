package com.locate

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import androidx.core.app.ActivityCompat
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

/**
 * HighAccuracyLocationModule - Module native để lấy vị trí GPS chính xác cao
 *
 * Chiến lược lấy vị trí:
 * 1. Ưu tiên GPS với độ chính xác cao (≤20m)
 * 2. Sử dụng Network làm fallback sau 5 giây nếu GPS chậm
 * 3. Timeout sau 15 giây và trả về vị trí tốt nhất có được
 * 4. Chỉ trả về latitude và longitude để đơn giản hóa
 */
class HighAccuracyLocationModule(reactContext: ReactApplicationContext) :
        ReactContextBaseJavaModule(reactContext) {

    // ===== SYSTEM SERVICES =====
    private val locationManager: LocationManager =
            reactContext.getSystemService(Context.LOCATION_SERVICE) as LocationManager
    private val handler = Handler(Looper.getMainLooper())

    // ===== CONFIGURATION CONSTANTS =====
    companion object {
        // Thời gian timeout tổng cộng (15 giây)
        private const val LOCATION_TIMEOUT = 15000L

        // Interval cập nhật GPS (1 giây - nhanh để có độ chính xác cao)
        private const val GPS_UPDATE_INTERVAL = 1000L

        // Interval cập nhật Network (2 giây - chậm hơn vì ít chính xác)
        private const val NETWORK_UPDATE_INTERVAL = 2000L

        // Delay trước khi bật Network provider (5 giây cho GPS cơ hội trước)
        private const val NETWORK_FALLBACK_DELAY = 5000L

        // Ngưỡng độ chính xác GPS tốt (20 mét)
        private const val GPS_GOOD_ACCURACY_THRESHOLD = 20f

        // Ngưỡng độ chính xác Network chấp nhận được (50 mét)
        private const val NETWORK_ACCEPTABLE_ACCURACY = 50f
    }

    // ===== REACT NATIVE INTERFACE =====
    override fun getName(): String = "HighAccuracyLocation"

    /**
     * Method chính được gọi từ JavaScript để lấy vị trí hiện tại Trả về Promise với {latitude:
     * double, longitude: double}
     */
    @ReactMethod
    fun getHighAccuracyPosition(promise: Promise) {
        android.util.Log.d("HighAccuracyLocation", "Bắt đầu yêu cầu vị trí chính xác cao")

        // Kiểm tra quyền truy cập vị trí
        if (!hasLocationPermission()) {
            promise.reject(
                    "PERMISSION_DENIED",
                    "Cần quyền truy cập vị trí để sử dụng tính năng này"
            )
            return
        }

        // Kiểm tra xem có provider nào khả dụng không
        if (!isAnyLocationProviderEnabled()) {
            promise.reject("GPS_DISABLED", "Vui lòng bật GPS hoặc dịch vụ vị trí")
            return
        }

        // Bắt đầu quá trình lấy vị trí
        startLocationRequest(promise)
    }

    // ===== PERMISSION & PROVIDER CHECKS =====
    /** Kiểm tra xem app có quyền ACCESS_FINE_LOCATION không */
    private fun hasLocationPermission(): Boolean {
        return ActivityCompat.checkSelfPermission(
                reactApplicationContext,
                Manifest.permission.ACCESS_FINE_LOCATION
        ) == PackageManager.PERMISSION_GRANTED
    }

    /** Kiểm tra xem có ít nhất một location provider nào được bật không */
    private fun isAnyLocationProviderEnabled(): Boolean {
        return locationManager.isProviderEnabled(LocationManager.GPS_PROVIDER) ||
                locationManager.isProviderEnabled(LocationManager.NETWORK_PROVIDER)
    }

    // ===== CORE LOCATION LOGIC =====
    /** Bắt đầu quá trình yêu cầu vị trí với chiến lược ưu tiên GPS */
    private fun startLocationRequest(promise: Promise) {
        var isRequestCompleted = false
        var bestLocationFound: Location? = null
        val requestStartTime = System.currentTimeMillis()

        // Tạo LocationListener để xử lý các cập nhật vị trí
        val locationListener =
                createLocationListener(
                        promise,
                        { isRequestCompleted },
                        { isRequestCompleted = it },
                        { bestLocationFound },
                        { bestLocationFound = it },
                        requestStartTime
                )

        try {
            // Bước 1: Bắt đầu với GPS nếu có thể (độ chính xác cao)
            startGpsProvider(locationListener)

            // Bước 2: Sau delay, bắt đầu Network provider (fallback)
            scheduleNetworkProviderStart(locationListener, isRequestCompleted)

            // Bước 3: Thiết lập timeout để đảm bảo không chờ mãi
            scheduleTimeoutHandler(
                    promise,
                    locationListener,
                    { isRequestCompleted },
                    { isRequestCompleted = it },
                    { bestLocationFound }
            )
        } catch (e: SecurityException) {
            promise.reject("PERMISSION_DENIED", "Quyền vị trí bị từ chối: ${e.message}")
        }
    }

    /** Tạo LocationListener với logic xử lý cập nhật vị trí thông minh */
    private fun createLocationListener(
            promise: Promise,
            isCompleted: () -> Boolean,
            setCompleted: (Boolean) -> Unit,
            getBestLocation: () -> Location?,
            setBestLocation: (Location?) -> Unit,
            startTime: Long
    ): LocationListener {
        val locationListener =
                object : LocationListener {
                    override fun onLocationChanged(location: Location) {
                        if (isCompleted()) return

                        val elapsed = System.currentTimeMillis() - startTime
                        val isGpsProvider = location.provider == LocationManager.GPS_PROVIDER

                        android.util.Log.d(
                                "HighAccuracyLocation",
                                "Nhận vị trí: provider=${location.provider}, độ chính xác=${location.accuracy}m, thời gian=${elapsed}ms"
                        )

                        // Cập nhật vị trí tốt nhất dựa trên độ chính xác
                        updateBestLocationIfBetter(location, getBestLocation(), setBestLocation)

                        // Trả về ngay lập tức nếu GPS có độ chính xác tốt
                        if (shouldReturnGpsLocationImmediately(isGpsProvider, location.accuracy)) {
                            completeLocationRequest(location, promise, setCompleted, this)
                            return
                        }

                        // Trả về Network sau delay nếu không có GPS tốt
                        if (shouldReturnNetworkLocationAfterDelay(
                                        isGpsProvider,
                                        elapsed,
                                        location.accuracy
                                )
                        ) {
                            completeLocationRequest(location, promise, setCompleted, this)
                            return
                        }
                    }

                    @Deprecated("Deprecated in API")
                    override fun onStatusChanged(provider: String?, status: Int, extras: Bundle?) {
                        // Method này deprecated nhưng vẫn cần implement
                    }

                    override fun onProviderEnabled(provider: String) {
                        android.util.Log.d("HighAccuracyLocation", "Provider đã bật: $provider")
                    }

                    override fun onProviderDisabled(provider: String) {
                        android.util.Log.d("HighAccuracyLocation", "Provider đã tắt: $provider")
                    }
                }
        return locationListener
    }

    /** Bắt đầu GPS provider nếu có thể */
    private fun startGpsProvider(locationListener: LocationListener) {
        if (locationManager.isProviderEnabled(LocationManager.GPS_PROVIDER)) {
            locationManager.requestLocationUpdates(
                    LocationManager.GPS_PROVIDER,
                    GPS_UPDATE_INTERVAL,
                    0f,
                    locationListener
            )
            android.util.Log.d("HighAccuracyLocation", "GPS provider đã được khởi động")
        } else {
            android.util.Log.w("HighAccuracyLocation", "GPS provider không khả dụng")
        }
    }

    /** Lên lịch khởi động Network provider sau delay */
    private fun scheduleNetworkProviderStart(
            locationListener: LocationListener,
            isCompleted: Boolean
    ) {
        if (locationManager.isProviderEnabled(LocationManager.NETWORK_PROVIDER)) {
            handler.postDelayed(
                    {
                        if (!isCompleted) {
                            try {
                                locationManager.requestLocationUpdates(
                                        LocationManager.NETWORK_PROVIDER,
                                        NETWORK_UPDATE_INTERVAL,
                                        0f,
                                        locationListener
                                )
                                android.util.Log.d(
                                        "HighAccuracyLocation",
                                        "Network provider đã được khởi động"
                                )
                            } catch (e: SecurityException) {
                                android.util.Log.w(
                                        "HighAccuracyLocation",
                                        "Network provider thất bại: ${e.message}"
                                )
                            }
                        }
                    },
                    NETWORK_FALLBACK_DELAY
            )
        }
    }

    /** Lên lịch timeout handler để đảm bảo không chờ mãi */
    private fun scheduleTimeoutHandler(
            promise: Promise,
            locationListener: LocationListener,
            isCompleted: () -> Boolean,
            setCompleted: (Boolean) -> Unit,
            getBestLocation: () -> Location?
    ) {
        handler.postDelayed(
                {
                    if (!isCompleted()) {
                        setCompleted(true)
                        locationManager.removeUpdates(locationListener)

                        // Trả về vị trí tốt nhất có được hoặc báo lỗi timeout
                        getBestLocation()?.let { location ->
                            returnLocationResult(location, promise)
                        }
                                ?: promise.reject("TIMEOUT", "Yêu cầu vị trí đã hết thời gian chờ")
                    }
                },
                LOCATION_TIMEOUT
        )
    }

    // ===== LOCATION DECISION LOGIC =====
    /** Cập nhật vị trí tốt nhất nếu vị trí mới có độ chính xác cao hơn */
    private fun updateBestLocationIfBetter(
            newLocation: Location,
            currentBest: Location?,
            setBestLocation: (Location?) -> Unit
    ) {
        if (currentBest == null || newLocation.accuracy < currentBest.accuracy) {
            setBestLocation(newLocation)
        }
    }

    /** Kiểm tra xem có nên trả về vị trí GPS ngay lập tức không */
    private fun shouldReturnGpsLocationImmediately(
            isGpsProvider: Boolean,
            accuracy: Float
    ): Boolean {
        return isGpsProvider && accuracy <= GPS_GOOD_ACCURACY_THRESHOLD
    }

    /** Kiểm tra xem có nên trả về vị trí Network sau delay không */
    private fun shouldReturnNetworkLocationAfterDelay(
            isGpsProvider: Boolean,
            elapsed: Long,
            accuracy: Float
    ): Boolean {
        return !isGpsProvider &&
                elapsed > NETWORK_FALLBACK_DELAY &&
                accuracy <= NETWORK_ACCEPTABLE_ACCURACY
    }

    /** Hoàn thành yêu cầu vị trí và trả về kết quả */
    private fun completeLocationRequest(
            location: Location,
            promise: Promise,
            setCompleted: (Boolean) -> Unit,
            locationListener: LocationListener
    ) {
        setCompleted(true)
        locationManager.removeUpdates(locationListener)
        returnLocationResult(location, promise)
    }

    // ===== RESULT HANDLING =====
    /** Trả về kết quả vị trí cho JavaScript Format: {latitude: double, longitude: double} */
    private fun returnLocationResult(location: Location, promise: Promise) {
        val result =
                Arguments.createMap().apply {
                    putDouble("latitude", location.latitude)
                    putDouble("longitude", location.longitude)
                }
        android.util.Log.d(
                "HighAccuracyLocation",
                "Trả về vị trí: lat=${location.latitude}, lon=${location.longitude}, độ chính xác=${location.accuracy}m"
        )
        promise.resolve(result)
    }
}
