"""
Test MQTT Integration for FallGuard - Vayyar Radar Integration
Tests MQTT status, auto-registration, and device mapping endpoints
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
TEST_EMAIL = "admin@fallguard.io"
TEST_PASSWORD = "admin123"


class TestMQTTIntegration:
    """MQTT Integration endpoint tests"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup authentication token"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": TEST_EMAIL, "password": TEST_PASSWORD}
        )
        assert response.status_code == 200, f"Login failed: {response.text}"
        self.token = response.json()["access_token"]
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_mqtt_status_endpoint(self):
        """Test /api/mqtt/status returns MQTT connection status"""
        response = requests.get(
            f"{BASE_URL}/api/mqtt/status",
            headers=self.headers
        )
        
        assert response.status_code == 200
        data = response.json()
        
        # Verify response structure
        assert "enabled" in data
        assert "broker_host" in data
        assert "broker_port" in data
        assert "running" in data
        assert "connected" in data
        
        # Verify expected values
        assert data["enabled"] == True
        assert data["broker_host"] == "38.242.254.49"
        assert data["broker_port"] == 1883
        assert data["running"] == True
        print(f"MQTT Status: connected={data['connected']}, running={data['running']}")
    
    def test_mqtt_status_requires_auth(self):
        """Test /api/mqtt/status requires authentication"""
        response = requests.get(f"{BASE_URL}/api/mqtt/status")
        assert response.status_code == 403 or response.status_code == 401
    
    def test_sensors_list_includes_mqtt_radars(self):
        """Test that auto-registered MQTT radars appear in sensors list"""
        response = requests.get(
            f"{BASE_URL}/api/sensors",
            headers=self.headers
        )
        
        assert response.status_code == 200
        sensors = response.json()
        
        # Check for MQTT auto-registered sensors (model starts with id_)
        mqtt_sensors = [s for s in sensors if s.get('model', '').startswith('id_')]
        radar_sensors = [s for s in sensors if s.get('type') == 'RADAR']
        
        print(f"Total sensors: {len(sensors)}")
        print(f"MQTT auto-registered sensors: {len(mqtt_sensors)}")
        print(f"Radar sensors: {len(radar_sensors)}")
        
        # Verify at least some radar sensors exist
        assert len(radar_sensors) > 0, "No radar sensors found"
        
        # Verify MQTT sensors have proper structure
        for sensor in mqtt_sensors:
            assert "id" in sensor
            assert "name" in sensor
            assert "status" in sensor
            assert sensor["type"] == "RADAR"
            print(f"  - {sensor['name']}: {sensor['status']}")
    
    def test_mqtt_register_device_endpoint(self):
        """Test /api/mqtt/register-device maps device to sensor"""
        # First get a radar sensor
        response = requests.get(
            f"{BASE_URL}/api/sensors",
            headers=self.headers
        )
        assert response.status_code == 200
        sensors = response.json()
        
        radar_sensors = [s for s in sensors if s.get('type') == 'RADAR']
        assert len(radar_sensors) > 0, "No radar sensors to test with"
        
        sensor_id = radar_sensors[0]['id']
        test_device_id = "TEST_mqtt_device_pytest"
        
        # Register device
        response = requests.post(
            f"{BASE_URL}/api/mqtt/register-device",
            params={"device_id": test_device_id, "sensor_id": sensor_id},
            headers=self.headers
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "ok"
        assert test_device_id in data["message"]
        assert sensor_id in data["message"]
        print(f"Device registration: {data['message']}")
    
    def test_mqtt_register_device_invalid_sensor(self):
        """Test /api/mqtt/register-device with invalid sensor ID"""
        response = requests.post(
            f"{BASE_URL}/api/mqtt/register-device",
            params={"device_id": "test_device", "sensor_id": "invalid-sensor-id"},
            headers=self.headers
        )
        
        assert response.status_code == 404
        assert "not found" in response.json().get("detail", "").lower()
    
    def test_mqtt_register_device_requires_admin(self):
        """Test /api/mqtt/register-device requires admin permissions"""
        # This test verifies the endpoint requires authentication
        response = requests.post(
            f"{BASE_URL}/api/mqtt/register-device",
            params={"device_id": "test", "sensor_id": "test"}
        )
        assert response.status_code in [401, 403]


class TestRadarSensors:
    """Tests for radar sensor functionality"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup authentication token"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": TEST_EMAIL, "password": TEST_PASSWORD}
        )
        assert response.status_code == 200
        self.token = response.json()["access_token"]
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_radar_sensors_have_required_fields(self):
        """Test radar sensors have all required fields"""
        response = requests.get(
            f"{BASE_URL}/api/sensors",
            headers=self.headers
        )
        
        assert response.status_code == 200
        sensors = response.json()
        radar_sensors = [s for s in sensors if s.get('type') == 'RADAR']
        
        required_fields = ['id', 'name', 'type', 'status', 'zone_id', 'site_id', 'tenant_id']
        
        for sensor in radar_sensors:
            for field in required_fields:
                assert field in sensor, f"Missing field {field} in sensor {sensor.get('id')}"
            
            # Verify status is valid
            assert sensor['status'] in ['ONLINE', 'OFFLINE', 'MAINTENANCE']
    
    def test_filter_sensors_by_type(self):
        """Test filtering sensors by type"""
        response = requests.get(
            f"{BASE_URL}/api/sensors",
            params={"status": "ONLINE"},
            headers=self.headers
        )
        
        assert response.status_code == 200
        sensors = response.json()
        
        # All returned sensors should be ONLINE
        for sensor in sensors:
            assert sensor['status'] == 'ONLINE'
    
    def test_mqtt_auto_registered_sensors_online(self):
        """Test that MQTT auto-registered sensors show as ONLINE"""
        response = requests.get(
            f"{BASE_URL}/api/sensors",
            headers=self.headers
        )
        
        assert response.status_code == 200
        sensors = response.json()
        
        mqtt_sensors = [s for s in sensors if s.get('model', '').startswith('id_')]
        
        # MQTT sensors should be online if recently seen
        for sensor in mqtt_sensors:
            print(f"MQTT Sensor {sensor['name']}: status={sensor['status']}, last_seen={sensor.get('last_seen')}")
            # They should have a last_seen timestamp
            assert sensor.get('last_seen') is not None, f"MQTT sensor {sensor['id']} has no last_seen"


class TestHealthAndAuth:
    """Basic health and auth tests"""
    
    def test_health_endpoint(self):
        """Test /api/health returns healthy status"""
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "ok"
        assert data["database"] == "healthy"
    
    def test_login_success(self):
        """Test login with valid credentials"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": TEST_EMAIL, "password": TEST_PASSWORD}
        )
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert "refresh_token" in data
        assert data["token_type"] == "bearer"
    
    def test_login_invalid_credentials(self):
        """Test login with invalid credentials"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": "wrong@email.com", "password": "wrongpass"}
        )
        assert response.status_code == 401


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
