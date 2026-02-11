"""
Fall Events API Tests
Tests for fall-specific fields and functionality introduced in the Fall Events feature
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
TEST_EVENT_ID = "14a2f25b-4141-4e39-9639-c4be09e2804b"  # Known fall event with full data
SECOND_EVENT_ID = "141baf80-1492-4f9d-a2db-97686a3f00a8"  # Another fall event

# Required fall-specific fields that should be returned by the API
FALL_SPECIFIC_FIELDS = [
    'fall_status',
    'fall_status_history',
    'fall_loc_x_cm',
    'fall_loc_y_cm',
    'fall_loc_z_cm',
    'tar_height_est',
    'is_simulated',
]


@pytest.fixture(scope='module')
def auth_token():
    """Get authentication token for API testing"""
    response = requests.post(f"{BASE_URL}/api/auth/login", json={
        "email": "admin@ohmguard.io",
        "password": "admin123"
    })
    if response.status_code == 200:
        return response.json().get("access_token")
    pytest.skip("Authentication failed - cannot test fall events")


@pytest.fixture
def api_client(auth_token):
    """Requests session with auth header"""
    session = requests.Session()
    session.headers.update({
        "Content-Type": "application/json",
        "Authorization": f"Bearer {auth_token}"
    })
    return session


class TestFallEventsList:
    """Test GET /api/events returns fall-specific fields"""

    def test_events_list_returns_fall_fields(self, api_client):
        """GET /api/events should include fall-specific fields for FALL type events"""
        response = api_client.get(f"{BASE_URL}/api/events", params={"event_type": "FALL", "limit": 10})
        assert response.status_code == 200, f"Failed to list events: {response.text}"
        
        events = response.json()
        assert len(events) > 0, "No FALL events found in database"
        
        # Check first fall event has all required fields
        fall_event = events[0]
        for field in FALL_SPECIFIC_FIELDS:
            assert field in fall_event, f"Missing fall-specific field: {field}"
        
        print(f"✓ Events list returns all fall-specific fields: {FALL_SPECIFIC_FIELDS}")

    def test_events_list_fall_status_values(self, api_client):
        """Verify fall_status contains valid lifecycle status values"""
        response = api_client.get(f"{BASE_URL}/api/events", params={"event_type": "FALL"})
        assert response.status_code == 200
        
        events = response.json()
        valid_statuses = ['fall_detected', 'fall_confirmed', 'calling', 'on_call', 'finished', 'fall_exit', 'canceled']
        
        for event in events:
            if event.get('fall_status'):
                assert event['fall_status'] in valid_statuses, f"Invalid fall_status: {event['fall_status']}"
        
        print(f"✓ All fall_status values are valid lifecycle statuses")

    def test_events_list_fall_location_coordinates(self, api_client):
        """Verify fall location coordinates are numeric values"""
        response = api_client.get(f"{BASE_URL}/api/events", params={"event_type": "FALL"})
        assert response.status_code == 200
        
        events = response.json()
        for event in events:
            if event.get('fall_loc_x_cm') is not None:
                assert isinstance(event['fall_loc_x_cm'], (int, float)), "fall_loc_x_cm should be numeric"
            if event.get('fall_loc_y_cm') is not None:
                assert isinstance(event['fall_loc_y_cm'], (int, float)), "fall_loc_y_cm should be numeric"
            if event.get('fall_loc_z_cm') is not None:
                assert isinstance(event['fall_loc_z_cm'], (int, float)), "fall_loc_z_cm should be numeric"
        
        print(f"✓ Fall location coordinates are valid numeric values")


class TestFallEventDetail:
    """Test GET /api/events/{event_id} returns detailed fall event"""

    def test_get_event_detail_with_fall_fields(self, api_client):
        """GET /api/events/{event_id} should return all fall-specific fields"""
        response = api_client.get(f"{BASE_URL}/api/events/{TEST_EVENT_ID}")
        assert response.status_code == 200, f"Failed to get event detail: {response.text}"
        
        event = response.json()
        
        # Verify fall-specific fields are present
        assert event['type'] == 'FALL', "Event should be of type FALL"
        for field in FALL_SPECIFIC_FIELDS:
            assert field in event, f"Missing fall-specific field in detail: {field}"
        
        print(f"✓ Event detail includes all fall-specific fields")

    def test_fall_status_history_structure(self, api_client):
        """Verify fall_status_history is a list with proper structure"""
        response = api_client.get(f"{BASE_URL}/api/events/{TEST_EVENT_ID}")
        assert response.status_code == 200
        
        event = response.json()
        history = event.get('fall_status_history', [])
        
        assert isinstance(history, list), "fall_status_history should be a list"
        assert len(history) > 0, "fall_status_history should have entries"
        
        # Check structure of each history entry
        for entry in history:
            assert 'status' in entry, "History entry should have 'status'"
            assert 'timestamp' in entry, "History entry should have 'timestamp'"
        
        print(f"✓ fall_status_history has {len(history)} entries with correct structure")

    def test_fall_location_values(self, api_client):
        """Verify specific fall location values for known test event"""
        response = api_client.get(f"{BASE_URL}/api/events/{TEST_EVENT_ID}")
        assert response.status_code == 200
        
        event = response.json()
        
        # Test event should have specific location values
        assert event.get('fall_loc_x_cm') == 120.5, f"Expected fall_loc_x_cm=120.5, got {event.get('fall_loc_x_cm')}"
        assert event.get('fall_loc_y_cm') == 85.3, f"Expected fall_loc_y_cm=85.3, got {event.get('fall_loc_y_cm')}"
        assert event.get('fall_loc_z_cm') == 15.2, f"Expected fall_loc_z_cm=15.2, got {event.get('fall_loc_z_cm')}"
        assert event.get('tar_height_est') == 165.0, f"Expected tar_height_est=165.0, got {event.get('tar_height_est')}"
        
        print(f"✓ Fall location values match expected coordinates (X={event.get('fall_loc_x_cm')}, Y={event.get('fall_loc_y_cm')}, Z={event.get('fall_loc_z_cm')})")

    def test_is_simulated_flag(self, api_client):
        """Verify is_simulated flag is correctly returned"""
        response = api_client.get(f"{BASE_URL}/api/events/{TEST_EVENT_ID}")
        assert response.status_code == 200
        
        event = response.json()
        
        assert event.get('is_simulated') is True, f"Expected is_simulated=True, got {event.get('is_simulated')}"
        
        print(f"✓ is_simulated flag is correctly returned as True")


class TestFallEventStatusUpdate:
    """Test PATCH /api/events/{event_id} can update event status"""

    def test_update_status_to_ack(self, api_client):
        """PATCH /api/events/{event_id} should allow updating status to ACK"""
        response = api_client.patch(
            f"{BASE_URL}/api/events/{SECOND_EVENT_ID}",
            json={"status": "ACK"}
        )
        assert response.status_code == 200, f"Failed to update event status: {response.text}"
        
        event = response.json()
        assert event.get('status') == 'ACK', f"Expected status='ACK', got {event.get('status')}"
        
        # Verify fall fields are still present after update
        assert 'fall_status' in event, "fall_status should still be present after status update"
        
        print(f"✓ Event status successfully updated to ACK")

    def test_update_status_to_resolved(self, api_client):
        """PATCH /api/events/{event_id} should allow updating status to RESOLVED"""
        response = api_client.patch(
            f"{BASE_URL}/api/events/{SECOND_EVENT_ID}",
            json={"status": "RESOLVED"}
        )
        assert response.status_code == 200, f"Failed to update event status: {response.text}"
        
        event = response.json()
        assert event.get('status') == 'RESOLVED', f"Expected status='RESOLVED', got {event.get('status')}"
        
        print(f"✓ Event status successfully updated to RESOLVED")

    def test_update_status_to_false_alarm(self, api_client):
        """PATCH /api/events/{event_id} should allow updating status to FALSE_ALARM"""
        response = api_client.patch(
            f"{BASE_URL}/api/events/{SECOND_EVENT_ID}",
            json={"status": "FALSE_ALARM"}
        )
        assert response.status_code == 200, f"Failed to update event status: {response.text}"
        
        event = response.json()
        assert event.get('status') == 'FALSE_ALARM', f"Expected status='FALSE_ALARM', got {event.get('status')}"
        
        print(f"✓ Event status successfully updated to FALSE_ALARM")

    def test_reset_status_to_new(self, api_client):
        """Reset status back to NEW for future tests"""
        response = api_client.patch(
            f"{BASE_URL}/api/events/{SECOND_EVENT_ID}",
            json={"status": "NEW"}
        )
        assert response.status_code == 200, f"Failed to reset event status: {response.text}"
        
        event = response.json()
        assert event.get('status') == 'NEW', f"Expected status='NEW', got {event.get('status')}"
        
        print(f"✓ Event status reset to NEW")


class TestEventTypeFilter:
    """Test event type filtering includes SENSITIVE_FALL and BED_EXIT"""

    def test_sensitive_fall_filter(self, api_client):
        """GET /api/events with event_type=SENSITIVE_FALL should work"""
        response = api_client.get(f"{BASE_URL}/api/events", params={"event_type": "SENSITIVE_FALL", "limit": 5})
        assert response.status_code == 200, f"SENSITIVE_FALL filter failed: {response.text}"
        
        # May be empty if no SENSITIVE_FALL events exist
        events = response.json()
        assert isinstance(events, list), "Response should be a list"
        
        print(f"✓ SENSITIVE_FALL filter works (found {len(events)} events)")

    def test_bed_exit_filter(self, api_client):
        """GET /api/events with event_type=BED_EXIT should work"""
        response = api_client.get(f"{BASE_URL}/api/events", params={"event_type": "BED_EXIT", "limit": 5})
        assert response.status_code == 200, f"BED_EXIT filter failed: {response.text}"
        
        # May be empty if no BED_EXIT events exist
        events = response.json()
        assert isinstance(events, list), "Response should be a list"
        
        print(f"✓ BED_EXIT filter works (found {len(events)} events)")


class TestFallEventNotFound:
    """Test error handling for non-existent events"""

    def test_get_nonexistent_event(self, api_client):
        """GET /api/events/{event_id} should return 404 for non-existent event"""
        fake_event_id = "00000000-0000-0000-0000-000000000000"
        response = api_client.get(f"{BASE_URL}/api/events/{fake_event_id}")
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        
        print(f"✓ Non-existent event returns 404")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
