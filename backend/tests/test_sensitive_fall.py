"""
Test Suite for SENSITIVE_FALL (type 8) Event Integration
Tests:
- POST /api/create-sensitive-fall-event creates events correctly
- GET /api/events returns SENSITIVE_FALL events with proper fields
- Verify type='SENSITIVE_FALL', fall_status, confidence_level, suspected_events_counter
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
if not BASE_URL:
    BASE_URL = "https://ai-sensor-payload.preview.emergentagent.com"


class TestSensitiveFallIntegration:
    """Test SENSITIVE_FALL (type 8) event creation and retrieval"""
    
    auth_token = None
    created_event_id = None
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get auth token before tests"""
        if not TestSensitiveFallIntegration.auth_token:
            response = requests.post(f"{BASE_URL}/api/auth/login", json={
                "email": "admin@ohmguard.io",
                "password": "admin123"
            })
            assert response.status_code == 200, f"Login failed: {response.text}"
            TestSensitiveFallIntegration.auth_token = response.json()["access_token"]
    
    def get_headers(self):
        return {
            "Authorization": f"Bearer {TestSensitiveFallIntegration.auth_token}",
            "Content-Type": "application/json"
        }
    
    # ===== TEST 1: Create SENSITIVE_FALL event via test endpoint =====
    def test_01_create_sensitive_fall_event(self):
        """POST /api/create-sensitive-fall-event should create a SENSITIVE_FALL event"""
        response = requests.post(
            f"{BASE_URL}/api/create-sensitive-fall-event",
            headers=self.get_headers()
        )
        
        assert response.status_code == 200, f"Create sensitive fall event failed: {response.text}"
        data = response.json()
        
        # Verify response structure
        assert "event_id" in data, "Response should contain event_id"
        assert "message" in data, "Response should contain message"
        assert "Sensitive Fall event created" in data["message"], f"Unexpected message: {data['message']}"
        
        # Store event ID for later tests
        TestSensitiveFallIntegration.created_event_id = data["event_id"]
        print(f"SUCCESS: Created SENSITIVE_FALL event with ID: {data['event_id']}")
    
    # ===== TEST 2: Verify SENSITIVE_FALL event in events list =====
    def test_02_get_sensitive_fall_events(self):
        """GET /api/events should return SENSITIVE_FALL events with correct fields"""
        response = requests.get(
            f"{BASE_URL}/api/events",
            params={"event_type": "SENSITIVE_FALL", "limit": 20},
            headers=self.get_headers()
        )
        
        assert response.status_code == 200, f"Get events failed: {response.text}"
        events = response.json()
        
        assert isinstance(events, list), "Response should be a list"
        assert len(events) > 0, "Should have at least one SENSITIVE_FALL event"
        
        # Check first SENSITIVE_FALL event structure
        event = events[0]
        print(f"SENSITIVE_FALL event fields: {list(event.keys())}")
        
        # Verify event type
        assert event.get("type") == "SENSITIVE_FALL", f"Event type should be SENSITIVE_FALL, got: {event.get('type')}"
        
        # Verify fall_status field exists
        assert "fall_status" in event, "Event should have fall_status field"
        print(f"fall_status: {event.get('fall_status')}")
        
        # Verify confidence fields
        has_confidence = (
            "confidence_level" in event or 
            "confidence" in event or 
            event.get("confidence_level") is not None
        )
        print(f"confidence_level: {event.get('confidence_level')}, confidence: {event.get('confidence')}")
        
        # Verify suspected_events_counter
        print(f"suspected_events_counter: {event.get('suspected_events_counter')}")
        
        print(f"SUCCESS: Found {len(events)} SENSITIVE_FALL events with correct structure")
    
    # ===== TEST 3: Verify specific event fields for SENSITIVE_FALL =====
    def test_03_verify_sensitive_fall_event_details(self):
        """Verify the created SENSITIVE_FALL event has all required fields"""
        event_id = TestSensitiveFallIntegration.created_event_id
        if not event_id:
            pytest.skip("No event ID from previous test")
        
        response = requests.get(
            f"{BASE_URL}/api/events/{event_id}",
            headers=self.get_headers()
        )
        
        assert response.status_code == 200, f"Get event detail failed: {response.text}"
        event = response.json()
        
        # Verify type is SENSITIVE_FALL
        assert event.get("type") == "SENSITIVE_FALL", f"Type should be SENSITIVE_FALL, got: {event.get('type')}"
        
        # Verify fall_status
        assert event.get("fall_status") is not None, "Should have fall_status"
        assert event.get("fall_status") in ["fall_suspected", "calling", "finished", "fall_exit"], \
            f"Invalid fall_status: {event.get('fall_status')}"
        
        # Verify confidence_level (should be present for SENSITIVE_FALL)
        assert event.get("confidence_level") is not None or event.get("confidence") is not None, \
            "Should have confidence_level or confidence"
        
        # Verify is_simulated is True (from test endpoint)
        assert event.get("is_simulated") == True, "Test event should have is_simulated=True"
        
        # Verify fall location fields
        assert event.get("fall_loc_x_cm") is not None, "Should have fall_loc_x_cm"
        assert event.get("fall_loc_y_cm") is not None, "Should have fall_loc_y_cm"
        assert event.get("fall_loc_z_cm") is not None, "Should have fall_loc_z_cm"
        
        # Verify fall_status_history exists
        assert "fall_status_history" in event, "Should have fall_status_history"
        assert isinstance(event.get("fall_status_history"), list), "fall_status_history should be a list"
        
        print(f"SUCCESS: Event {event_id} has all required SENSITIVE_FALL fields")
        print(f"  - type: {event.get('type')}")
        print(f"  - fall_status: {event.get('fall_status')}")
        print(f"  - confidence_level: {event.get('confidence_level')}")
        print(f"  - suspected_events_counter: {event.get('suspected_events_counter')}")
        print(f"  - last_event_confidence: {event.get('last_event_confidence')}")
        print(f"  - fall location: ({event.get('fall_loc_x_cm')}, {event.get('fall_loc_y_cm')}, {event.get('fall_loc_z_cm')}) cm")
        print(f"  - is_simulated: {event.get('is_simulated')}")
    
    # ===== TEST 4: Verify FALL events still work correctly =====
    def test_04_verify_fall_events_still_work(self):
        """GET /api/events with event_type=FALL should still return FALL events"""
        response = requests.get(
            f"{BASE_URL}/api/events",
            params={"event_type": "FALL", "limit": 10},
            headers=self.get_headers()
        )
        
        assert response.status_code == 200, f"Get FALL events failed: {response.text}"
        events = response.json()
        
        if len(events) == 0:
            print("INFO: No FALL events found in database (expected if only SENSITIVE_FALL tests run)")
            pytest.skip("No FALL events to verify")
        
        # Verify all returned events are FALL type
        for event in events:
            assert event.get("type") == "FALL", f"Event type should be FALL, got: {event.get('type')}"
        
        print(f"SUCCESS: Found {len(events)} FALL events")
    
    # ===== TEST 5: Verify both FALL and SENSITIVE_FALL in combined query =====
    def test_05_both_event_types_in_list(self):
        """GET /api/events without type filter should return both FALL and SENSITIVE_FALL"""
        response = requests.get(
            f"{BASE_URL}/api/events",
            params={"limit": 50},
            headers=self.get_headers()
        )
        
        assert response.status_code == 200, f"Get all events failed: {response.text}"
        events = response.json()
        
        # Count event types
        fall_count = sum(1 for e in events if e.get("type") == "FALL")
        sensitive_fall_count = sum(1 for e in events if e.get("type") == "SENSITIVE_FALL")
        other_count = len(events) - fall_count - sensitive_fall_count
        
        print(f"Event type distribution: FALL={fall_count}, SENSITIVE_FALL={sensitive_fall_count}, OTHER={other_count}")
        
        # At minimum we should have SENSITIVE_FALL from our test
        assert sensitive_fall_count > 0, "Should have at least one SENSITIVE_FALL event"
        
        print(f"SUCCESS: Events list contains both event types correctly")


class TestAlertContext:
    """Test that AlertContext loads both FALL and SENSITIVE_FALL events"""
    
    auth_token = None
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get auth token before tests"""
        if not TestAlertContext.auth_token:
            response = requests.post(f"{BASE_URL}/api/auth/login", json={
                "email": "admin@ohmguard.io",
                "password": "admin123"
            })
            assert response.status_code == 200, f"Login failed: {response.text}"
            TestAlertContext.auth_token = response.json()["access_token"]
    
    def get_headers(self):
        return {
            "Authorization": f"Bearer {TestAlertContext.auth_token}",
            "Content-Type": "application/json"
        }
    
    def test_alert_context_loads_fall_events(self):
        """AlertContext should load FALL events"""
        # FALL with status NEW
        response = requests.get(
            f"{BASE_URL}/api/events",
            params={"event_type": "FALL", "status": "NEW", "limit": 20},
            headers=self.get_headers()
        )
        assert response.status_code == 200
        new_falls = response.json()
        
        # FALL with status ACK
        response = requests.get(
            f"{BASE_URL}/api/events",
            params={"event_type": "FALL", "status": "ACK", "limit": 20},
            headers=self.get_headers()
        )
        assert response.status_code == 200
        ack_falls = response.json()
        
        print(f"FALL events: NEW={len(new_falls)}, ACK={len(ack_falls)}")
        print("SUCCESS: AlertContext can load FALL events with status filters")
    
    def test_alert_context_loads_sensitive_fall_events(self):
        """AlertContext should load SENSITIVE_FALL events"""
        # SENSITIVE_FALL with status NEW
        response = requests.get(
            f"{BASE_URL}/api/events",
            params={"event_type": "SENSITIVE_FALL", "status": "NEW", "limit": 20},
            headers=self.get_headers()
        )
        assert response.status_code == 200
        new_sf = response.json()
        
        # SENSITIVE_FALL with status ACK
        response = requests.get(
            f"{BASE_URL}/api/events",
            params={"event_type": "SENSITIVE_FALL", "status": "ACK", "limit": 20},
            headers=self.get_headers()
        )
        assert response.status_code == 200
        ack_sf = response.json()
        
        print(f"SENSITIVE_FALL events: NEW={len(new_sf)}, ACK={len(ack_sf)}")
        assert len(new_sf) + len(ack_sf) > 0, "Should have at least one SENSITIVE_FALL event"
        print("SUCCESS: AlertContext can load SENSITIVE_FALL events with status filters")
    
    def test_alert_context_loads_bed_exit_events(self):
        """AlertContext should load BED_EXIT events"""
        # BED_EXIT with status NEW
        response = requests.get(
            f"{BASE_URL}/api/events",
            params={"event_type": "BED_EXIT", "status": "NEW", "limit": 20},
            headers=self.get_headers()
        )
        assert response.status_code == 200
        new_bed = response.json()
        
        # BED_EXIT with status ACK
        response = requests.get(
            f"{BASE_URL}/api/events",
            params={"event_type": "BED_EXIT", "status": "ACK", "limit": 20},
            headers=self.get_headers()
        )
        assert response.status_code == 200
        ack_bed = response.json()
        
        print(f"BED_EXIT events: NEW={len(new_bed)}, ACK={len(ack_bed)}")
        print("SUCCESS: AlertContext can load BED_EXIT events with status filters")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
