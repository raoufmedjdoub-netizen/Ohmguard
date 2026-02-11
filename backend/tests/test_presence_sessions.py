"""
Presence Sessions API Tests
Tests for the new presence session aggregated tracking feature.
Sessions replace raw PRESENCE events - they track start, end, and duration.
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://ai-sensor-payload.preview.emergentagent.com')

# Test credentials
ADMIN_EMAIL = "admin@ohmguard.com"
ADMIN_PASSWORD = "admin123"


@pytest.fixture(scope="module")
def auth_token():
    """Get authentication token for SUPER_ADMIN"""
    response = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}
    )
    assert response.status_code == 200, f"Login failed: {response.text}"
    data = response.json()
    return data["access_token"]


@pytest.fixture
def auth_headers(auth_token):
    """Return headers with auth token"""
    return {"Authorization": f"Bearer {auth_token}"}


class TestPresenceSessionsAPI:
    """Test suite for presence sessions endpoints"""
    
    def test_list_presence_sessions(self, auth_headers):
        """GET /api/presence-sessions - List all sessions"""
        response = requests.get(
            f"{BASE_URL}/api/presence-sessions",
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        
        # Verify response structure
        assert "sessions" in data
        assert "count" in data
        assert "filters" in data
        assert isinstance(data["sessions"], list)
        
        # If sessions exist, verify session structure
        if data["sessions"]:
            session = data["sessions"][0]
            assert "id" in session
            assert "sensor_id" in session
            assert "start_at" in session
            assert "status" in session
            assert session["status"] in ["ACTIVE", "COMPLETED"]
        
        print(f"Found {data['count']} presence sessions")
    
    def test_list_sessions_with_status_filter(self, auth_headers):
        """GET /api/presence-sessions?status=ACTIVE - Filter by status"""
        response = requests.get(
            f"{BASE_URL}/api/presence-sessions?status=ACTIVE",
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        
        # All returned sessions should have ACTIVE status
        for session in data["sessions"]:
            assert session["status"] == "ACTIVE"
        
        # Verify filter is returned
        assert data["filters"]["status"] == "ACTIVE"
        print(f"Found {data['count']} ACTIVE sessions")
    
    def test_list_sessions_with_completed_status(self, auth_headers):
        """GET /api/presence-sessions?status=COMPLETED - Filter completed sessions"""
        response = requests.get(
            f"{BASE_URL}/api/presence-sessions?status=COMPLETED",
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        
        # All returned sessions should have COMPLETED status
        for session in data["sessions"]:
            assert session["status"] == "COMPLETED"
            # Completed sessions should have end_at and duration_sec
            assert session["end_at"] is not None
            assert session["duration_sec"] is not None
        
        print(f"Found {data['count']} COMPLETED sessions")
    
    def test_get_active_sessions(self, auth_headers):
        """GET /api/presence-sessions/active - Get currently active sessions"""
        response = requests.get(
            f"{BASE_URL}/api/presence-sessions/active",
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        
        # Verify response structure
        assert "active_sessions" in data
        assert "count" in data
        assert isinstance(data["active_sessions"], list)
        
        # All sessions should be ACTIVE
        for session in data["active_sessions"]:
            assert session["status"] == "ACTIVE"
            # Active sessions should have current_duration_display
            assert "current_duration_display" in session or "current_duration_sec" in session
        
        print(f"Found {data['count']} active sessions")
    
    def test_get_session_stats(self, auth_headers):
        """GET /api/presence-sessions/stats - Get aggregated statistics"""
        response = requests.get(
            f"{BASE_URL}/api/presence-sessions/stats",
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        
        # Verify stats structure
        assert "total_sessions" in data
        assert "total_duration_sec" in data
        assert "avg_duration_sec" in data
        assert "active_sessions" in data
        assert "total_duration_display" in data
        assert "avg_duration_display" in data
        
        # Values should be numeric
        assert isinstance(data["total_sessions"], int)
        assert isinstance(data["active_sessions"], int)
        
        print(f"Stats: {data['total_sessions']} total sessions, {data['active_sessions']} active")
    
    def test_get_daily_stats(self, auth_headers):
        """GET /api/presence-sessions/daily - Get daily statistics"""
        response = requests.get(
            f"{BASE_URL}/api/presence-sessions/daily?days=7",
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        
        # Verify response structure
        assert "daily_stats" in data
        assert "days" in data
        assert data["days"] == 7
        assert isinstance(data["daily_stats"], list)
        
        # If daily stats exist, verify structure
        if data["daily_stats"]:
            day_stat = data["daily_stats"][0]
            assert "date" in day_stat
            assert "sessions_count" in day_stat
            assert "total_duration_sec" in day_stat
            assert "avg_duration_sec" in day_stat
        
        print(f"Got {len(data['daily_stats'])} days of stats")
    
    def test_get_session_by_id(self, auth_headers):
        """GET /api/presence-sessions/{session_id} - Get specific session"""
        # First get a session ID from the list
        list_response = requests.get(
            f"{BASE_URL}/api/presence-sessions?limit=1",
            headers=auth_headers
        )
        assert list_response.status_code == 200
        sessions = list_response.json()["sessions"]
        
        if not sessions:
            pytest.skip("No sessions available to test")
        
        session_id = sessions[0]["id"]
        
        # Get specific session
        response = requests.get(
            f"{BASE_URL}/api/presence-sessions/{session_id}",
            headers=auth_headers
        )
        assert response.status_code == 200
        session = response.json()
        
        # Verify session data
        assert session["id"] == session_id
        assert "sensor_id" in session
        assert "start_at" in session
        assert "status" in session
        
        print(f"Successfully retrieved session {session_id}")
    
    def test_session_not_found(self, auth_headers):
        """GET /api/presence-sessions/{session_id} - Non-existent session returns 404"""
        response = requests.get(
            f"{BASE_URL}/api/presence-sessions/non-existent-id-123",
            headers=auth_headers
        )
        assert response.status_code == 404
        print("Correctly returns 404 for non-existent session")


class TestPresenceEventsNotSaved:
    """Tests to verify PRESENCE events are NOT saved in events collection"""
    
    def test_no_presence_events_in_events_collection(self, auth_headers):
        """GET /api/events?event_type=PRESENCE - Should return empty or no PRESENCE type"""
        response = requests.get(
            f"{BASE_URL}/api/events?event_type=PRESENCE&limit=100",
            headers=auth_headers
        )
        assert response.status_code == 200
        events = response.json()
        
        # Events list should be empty or not contain PRESENCE events
        assert isinstance(events, list)
        presence_events = [e for e in events if e.get("type") == "PRESENCE"]
        
        assert len(presence_events) == 0, f"Found {len(presence_events)} PRESENCE events that should not exist"
        print("Verified: No PRESENCE events in events collection")


class TestSuperAdminAccess:
    """Tests for SUPER_ADMIN access to all sessions"""
    
    def test_super_admin_sees_all_sessions(self, auth_headers):
        """SUPER_ADMIN should see sessions without tenant_id filter"""
        response = requests.get(
            f"{BASE_URL}/api/presence-sessions",
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        
        # SUPER_ADMIN should be able to access sessions
        # The query should not filter by tenant_id for SUPER_ADMIN
        print(f"SUPER_ADMIN can access {data['count']} sessions")
    
    def test_super_admin_sees_all_active_sessions(self, auth_headers):
        """SUPER_ADMIN should see all active sessions"""
        response = requests.get(
            f"{BASE_URL}/api/presence-sessions/active",
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        
        print(f"SUPER_ADMIN can see {data['count']} active sessions")
    
    def test_super_admin_sees_all_stats(self, auth_headers):
        """SUPER_ADMIN should see aggregated stats for all tenants"""
        response = requests.get(
            f"{BASE_URL}/api/presence-sessions/stats",
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        
        # Stats should include active_sessions field
        assert "active_sessions" in data
        print(f"SUPER_ADMIN stats: {data['total_sessions']} total, {data['active_sessions']} active")


class TestBuildingFilter:
    """Tests for building_id filter"""
    
    def test_filter_by_building_id(self, auth_headers):
        """GET /api/presence-sessions?building_id=xxx - Filter by building"""
        # First get a session with building_id
        list_response = requests.get(
            f"{BASE_URL}/api/presence-sessions?limit=1",
            headers=auth_headers
        )
        sessions = list_response.json()["sessions"]
        
        if not sessions or not sessions[0].get("building_id"):
            pytest.skip("No sessions with building_id to test")
        
        building_id = sessions[0]["building_id"]
        
        response = requests.get(
            f"{BASE_URL}/api/presence-sessions?building_id={building_id}",
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        
        # All returned sessions should have the filtered building_id
        for session in data["sessions"]:
            assert session["building_id"] == building_id
        
        # Filter should be reflected in response
        assert data["filters"]["building_id"] == building_id
        print(f"Found {data['count']} sessions for building {building_id}")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
