#!/usr/bin/env python3
"""
FallGuard Backend API Testing Suite
Tests all API endpoints for the fall detection management platform
"""

import requests
import sys
import json
from datetime import datetime
from typing import Dict, Any, Optional

class FallGuardAPITester:
    def __init__(self, base_url: str = "https://radarevent.preview.emergentagent.com"):
        self.base_url = base_url
        self.token = None
        self.tests_run = 0
        self.tests_passed = 0
        self.test_results = []
        self.session = requests.Session()
        
    def log_test(self, name: str, success: bool, details: str = "", response_data: Any = None):
        """Log test result"""
        self.tests_run += 1
        if success:
            self.tests_passed += 1
            
        result = {
            "test": name,
            "success": success,
            "details": details,
            "response_data": response_data,
            "timestamp": datetime.now().isoformat()
        }
        self.test_results.append(result)
        
        status = "✅ PASS" if success else "❌ FAIL"
        print(f"{status} - {name}")
        if details:
            print(f"    {details}")
        if not success and response_data:
            print(f"    Response: {response_data}")
        print()

    def make_request(self, method: str, endpoint: str, data: Dict = None, expected_status: int = 200) -> tuple[bool, Any]:
        """Make HTTP request and return success status and response data"""
        url = f"{self.base_url}/api/{endpoint}"
        headers = {'Content-Type': 'application/json'}
        
        if self.token:
            headers['Authorization'] = f'Bearer {self.token}'
            
        try:
            if method == 'GET':
                response = self.session.get(url, headers=headers)
            elif method == 'POST':
                response = self.session.post(url, json=data, headers=headers)
            elif method == 'PATCH':
                response = self.session.patch(url, json=data, headers=headers)
            elif method == 'DELETE':
                response = self.session.delete(url, headers=headers)
            else:
                return False, f"Unsupported method: {method}"
                
            success = response.status_code == expected_status
            
            try:
                response_data = response.json()
            except:
                response_data = {"status_code": response.status_code, "text": response.text[:200]}
                
            return success, response_data
            
        except Exception as e:
            return False, f"Request failed: {str(e)}"

    def test_health_check(self):
        """Test health endpoint"""
        success, data = self.make_request('GET', 'health')
        if success and data.get('status') in ['ok', 'degraded']:
            self.log_test("Health Check", True, f"Status: {data.get('status')}")
            return True
        else:
            self.log_test("Health Check", False, "Health endpoint failed", data)
            return False

    def test_authentication(self):
        """Test authentication endpoints"""
        # Test login with admin credentials
        login_data = {
            "email": "admin@fallguard.io",
            "password": "admin123"
        }
        
        success, data = self.make_request('POST', 'auth/login', login_data)
        
        if success and 'access_token' in data:
            self.token = data['access_token']
            self.log_test("Admin Login", True, "Successfully authenticated")
            
            # Test /auth/me endpoint
            success, user_data = self.make_request('GET', 'auth/me')
            if success and user_data.get('email') == 'admin@fallguard.io':
                self.log_test("Get Current User", True, f"User: {user_data.get('email')}")
                return True
            else:
                self.log_test("Get Current User", False, "Failed to get user info", user_data)
                return False
        else:
            self.log_test("Admin Login", False, "Authentication failed", data)
            return False

    def test_stats_overview(self):
        """Test stats overview endpoint"""
        success, data = self.make_request('GET', 'stats/overview')
        
        if success and 'events' in data and 'sensors' in data:
            events = data['events']
            sensors = data['sensors']
            sites = data['sites']
            
            details = f"Events: {events.get('total', 0)}, Sensors: {sensors.get('total', 0)}, Sites: {sites.get('total', 0)}"
            self.log_test("Stats Overview", True, details)
            return True
        else:
            self.log_test("Stats Overview", False, "Invalid stats response", data)
            return False

    def test_events_endpoints(self):
        """Test events-related endpoints"""
        # List events
        success, data = self.make_request('GET', 'events?limit=10')
        
        if success and isinstance(data, list):
            event_count = len(data)
            self.log_test("List Events", True, f"Retrieved {event_count} events")
            
            # Test event count endpoint
            success, count_data = self.make_request('GET', 'events/count')
            if success and 'count' in count_data:
                self.log_test("Event Count", True, f"Total events: {count_data['count']}")
                
                # If we have events, test getting a specific event
                if data and len(data) > 0:
                    event_id = data[0]['id']
                    success, event_data = self.make_request('GET', f'events/{event_id}')
                    if success and event_data.get('id') == event_id:
                        self.log_test("Get Specific Event", True, f"Event ID: {event_id}")
                        return True
                    else:
                        self.log_test("Get Specific Event", False, "Failed to get event", event_data)
                        return False
                else:
                    self.log_test("Get Specific Event", True, "No events to test (expected)")
                    return True
            else:
                self.log_test("Event Count", False, "Failed to get event count", count_data)
                return False
        else:
            self.log_test("List Events", False, "Failed to list events", data)
            return False

    def test_sensors_endpoints(self):
        """Test sensors-related endpoints"""
        success, data = self.make_request('GET', 'sensors')
        
        if success and isinstance(data, list):
            sensor_count = len(data)
            self.log_test("List Sensors", True, f"Retrieved {sensor_count} sensors")
            
            # If we have sensors, test getting a specific sensor
            if data and len(data) > 0:
                sensor_id = data[0]['id']
                success, sensor_data = self.make_request('GET', f'sensors/{sensor_id}')
                if success and sensor_data.get('id') == sensor_id:
                    self.log_test("Get Specific Sensor", True, f"Sensor ID: {sensor_id}")
                    return True
                else:
                    self.log_test("Get Specific Sensor", False, "Failed to get sensor", sensor_data)
                    return False
            else:
                self.log_test("Get Specific Sensor", True, "No sensors to test (expected)")
                return True
        else:
            self.log_test("List Sensors", False, "Failed to list sensors", data)
            return False

    def test_sites_endpoints(self):
        """Test sites-related endpoints"""
        success, data = self.make_request('GET', 'sites')
        
        if success and isinstance(data, list):
            site_count = len(data)
            self.log_test("List Sites", True, f"Retrieved {site_count} sites")
            
            # If we have sites, test getting a specific site
            if data and len(data) > 0:
                site_id = data[0]['id']
                success, site_data = self.make_request('GET', f'sites/{site_id}')
                if success and site_data.get('id') == site_id:
                    self.log_test("Get Specific Site", True, f"Site ID: {site_id}")
                    return True
                else:
                    self.log_test("Get Specific Site", False, "Failed to get site", site_data)
                    return False
            else:
                self.log_test("Get Specific Site", True, "No sites to test (expected)")
                return True
        else:
            self.log_test("List Sites", False, "Failed to list sites", data)
            return False

    def test_zones_endpoints(self):
        """Test zones-related endpoints"""
        success, data = self.make_request('GET', 'zones')
        
        if success and isinstance(data, list):
            zone_count = len(data)
            self.log_test("List Zones", True, f"Retrieved {zone_count} zones")
            return True
        else:
            self.log_test("List Zones", False, "Failed to list zones", data)
            return False

    def test_alert_rules_endpoints(self):
        """Test alert rules endpoints"""
        success, data = self.make_request('GET', 'rules')
        
        if success and isinstance(data, list):
            rules_count = len(data)
            self.log_test("List Alert Rules", True, f"Retrieved {rules_count} alert rules")
            return True
        else:
            self.log_test("List Alert Rules", False, "Failed to list alert rules", data)
            return False

    def test_users_endpoints(self):
        """Test user management endpoints"""
        success, data = self.make_request('GET', 'users')
        
        if success and isinstance(data, list):
            user_count = len(data)
            self.log_test("List Users", True, f"Retrieved {user_count} users")
            return True
        else:
            self.log_test("List Users", False, "Failed to list users", data)
            return False

    def test_simulator_endpoint(self):
        """Test event simulator endpoint"""
        # First get a sensor to simulate with
        success, sensors = self.make_request('GET', 'sensors')
        
        if success and isinstance(sensors, list) and len(sensors) > 0:
            sensor_id = sensors[0]['id']
            
            # Simulate a fall event
            success, data = self.make_request('POST', f'simulator/event?sensor_id={sensor_id}&event_type=FALL&severity=HIGH&confidence=0.95')
            
            if success and data.get('type') == 'FALL':
                self.log_test("Event Simulator", True, f"Simulated fall event for sensor {sensor_id}")
                return True
            else:
                self.log_test("Event Simulator", False, "Failed to simulate event", data)
                return False
        else:
            self.log_test("Event Simulator", False, "No sensors available for simulation")
            return False

    def test_notifications_endpoint(self):
        """Test notifications endpoint"""
        success, data = self.make_request('GET', 'notifications?limit=10')
        
        if success and isinstance(data, list):
            notification_count = len(data)
            self.log_test("List Notifications", True, f"Retrieved {notification_count} notifications")
            return True
        else:
            self.log_test("List Notifications", False, "Failed to list notifications", data)
            return False

    def run_all_tests(self):
        """Run all API tests"""
        print("🚀 Starting FallGuard Backend API Tests")
        print("=" * 50)
        
        # Core tests
        if not self.test_health_check():
            print("❌ Health check failed - stopping tests")
            return False
            
        if not self.test_authentication():
            print("❌ Authentication failed - stopping tests")
            return False
        
        # API endpoint tests
        self.test_stats_overview()
        self.test_events_endpoints()
        self.test_sensors_endpoints()
        self.test_sites_endpoints()
        self.test_zones_endpoints()
        self.test_alert_rules_endpoints()
        self.test_users_endpoints()
        self.test_simulator_endpoint()
        self.test_notifications_endpoint()
        
        # Print summary
        print("=" * 50)
        print(f"📊 Test Results: {self.tests_passed}/{self.tests_run} passed")
        
        success_rate = (self.tests_passed / self.tests_run * 100) if self.tests_run > 0 else 0
        print(f"📈 Success Rate: {success_rate:.1f}%")
        
        if success_rate >= 80:
            print("✅ Backend API tests PASSED")
            return True
        else:
            print("❌ Backend API tests FAILED")
            return False

def main():
    """Main test runner"""
    tester = FallGuardAPITester()
    
    try:
        success = tester.run_all_tests()
        
        # Save detailed results
        with open('/app/test_reports/backend_test_results.json', 'w') as f:
            json.dump({
                'summary': {
                    'tests_run': tester.tests_run,
                    'tests_passed': tester.tests_passed,
                    'success_rate': (tester.tests_passed / tester.tests_run * 100) if tester.tests_run > 0 else 0,
                    'timestamp': datetime.now().isoformat()
                },
                'results': tester.test_results
            }, f, indent=2)
        
        return 0 if success else 1
        
    except Exception as e:
        print(f"❌ Test execution failed: {str(e)}")
        return 1

if __name__ == "__main__":
    sys.exit(main())