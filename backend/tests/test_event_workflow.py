"""
Test suite for OhmGuard advanced event workflow (ACK, RESOLVED, FALSE_ALARM, Assignment)
Tests:
- PATCH /api/events/{id} with status=RESOLVED without comment returns 400
- PATCH /api/events/{id} with status=RESOLVED and comment succeeds
- PATCH /api/events/{id} with assigned_to stores assigned_to_name
- GET /api/users/assignable returns users with SUPER_ADMIN/TENANT_ADMIN/SUPERVISOR/OPERATOR roles
- GET /api/events/{id}/comments returns comments array (admin only)
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
if not BASE_URL:
    BASE_URL = "https://alert-feed-live.preview.emergentagent.com"


@pytest.fixture(scope="module")
def auth_token():
    """Get authentication token for admin user"""
    response = requests.post(f"{BASE_URL}/api/auth/login", json={
        "email": "admin@ohmguard.io",
        "password": "admin123"
    })
    assert response.status_code == 200, f"Login failed: {response.text}"
    return response.json().get("access_token")


@pytest.fixture(scope="module")
def api_client(auth_token):
    """Create session with auth header"""
    session = requests.Session()
    session.headers.update({
        "Content-Type": "application/json",
        "Authorization": f"Bearer {auth_token}"
    })
    return session


@pytest.fixture(scope="module")
def test_event_id(api_client):
    """Get or create a test event for the workflow tests"""
    # First, try to find an existing NEW or ACK event
    response = api_client.get(f"{BASE_URL}/api/events?limit=10")
    if response.status_code == 200:
        events = response.json()
        for event in events:
            if event.get('status') in ['NEW', 'ACK'] and event.get('type') == 'FALL':
                return event['id']
    
    # If no suitable event exists, create one via the test endpoint
    response = api_client.post(f"{BASE_URL}/api/create-fall-event")
    if response.status_code == 200:
        return response.json().get('event_id')
    
    # Fallback: use the known test event ID if available
    return "57d694f0-5fd3-4db0-992d-02c10ab83bb6"


class TestEventWorkflow:
    """Tests for the event workflow actions (ACK, RESOLVED, FALSE_ALARM, ASSIGN)"""
    
    def test_resolve_without_comment_returns_400(self, api_client, test_event_id):
        """PATCH /api/events/{id} with status=RESOLVED without comment should return 400"""
        response = api_client.patch(
            f"{BASE_URL}/api/events/{test_event_id}",
            json={"status": "RESOLVED"}  # No comment provided
        )
        
        # Should fail with 400 because comment is required
        assert response.status_code == 400, f"Expected 400, got {response.status_code}: {response.text}"
        data = response.json()
        assert "detail" in data
        assert "commentaire" in data["detail"].lower() or "obligatoire" in data["detail"].lower()
        print(f"✓ RESOLVED without comment correctly returns 400: {data['detail']}")

    def test_false_alarm_without_comment_returns_400(self, api_client, test_event_id):
        """PATCH /api/events/{id} with status=FALSE_ALARM without comment should return 400"""
        response = api_client.patch(
            f"{BASE_URL}/api/events/{test_event_id}",
            json={"status": "FALSE_ALARM"}  # No comment provided
        )
        
        # Should fail with 400 because comment is required
        assert response.status_code == 400, f"Expected 400, got {response.status_code}: {response.text}"
        data = response.json()
        assert "detail" in data
        print(f"✓ FALSE_ALARM without comment correctly returns 400: {data['detail']}")

    def test_ack_without_comment_succeeds(self, api_client):
        """PATCH /api/events/{id} with status=ACK without comment should succeed (comment optional)"""
        # First, create a fresh event for this test
        response = api_client.post(f"{BASE_URL}/api/create-fall-event")
        if response.status_code != 200:
            pytest.skip("Could not create test event")
        event_id = response.json().get('event_id')
        
        response = api_client.patch(
            f"{BASE_URL}/api/events/{event_id}",
            json={"status": "ACK"}  # No comment - should be OK for ACK
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert data.get("status") == "ACK"
        print(f"✓ ACK without comment succeeds - event {event_id} now ACK")

    def test_resolve_with_comment_succeeds(self, api_client):
        """PATCH /api/events/{id} with status=RESOLVED and comment should succeed"""
        # Create a fresh event for this test
        response = api_client.post(f"{BASE_URL}/api/create-fall-event")
        if response.status_code != 200:
            pytest.skip("Could not create test event")
        event_id = response.json().get('event_id')
        
        # Resolve with comment
        response = api_client.patch(
            f"{BASE_URL}/api/events/{event_id}",
            json={
                "status": "RESOLVED",
                "comment": "TEST Resolution - Intervention effectuee avec succes"
            }
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert data.get("status") == "RESOLVED"
        assert data.get("comments") is not None
        assert len(data.get("comments", [])) > 0
        
        # Verify comment was stored correctly
        last_comment = data["comments"][-1]
        assert "Resolution" in last_comment.get("text", "") or "Intervention" in last_comment.get("text", "")
        assert last_comment.get("action") == "RESOLVED"
        print(f"✓ RESOLVED with comment succeeds - event {event_id} resolved with comment")


class TestUserAssignment:
    """Tests for user assignment to events"""
    
    def test_assignable_users_returns_correct_roles(self, api_client):
        """GET /api/users/assignable should return users with SUPER_ADMIN/TENANT_ADMIN/SUPERVISOR/OPERATOR roles"""
        response = api_client.get(f"{BASE_URL}/api/users/assignable")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        users = response.json()
        
        assert isinstance(users, list), "Response should be a list"
        assert len(users) > 0, "Should have at least one assignable user (admin)"
        
        allowed_roles = ["SUPER_ADMIN", "TENANT_ADMIN", "SUPERVISOR", "OPERATOR"]
        for user in users:
            assert "id" in user, "User should have 'id' field"
            assert "full_name" in user, "User should have 'full_name' field"
            assert "role" in user, "User should have 'role' field"
            assert user["role"] in allowed_roles, f"User role {user['role']} not in allowed roles"
        
        print(f"✓ /users/assignable returns {len(users)} users with correct roles: {[u['role'] for u in users]}")
    
    def test_assign_user_to_event_stores_name(self, api_client):
        """PATCH /api/events/{id} with assigned_to should store assigned_to_name"""
        # Get an assignable user first
        response = api_client.get(f"{BASE_URL}/api/users/assignable")
        assert response.status_code == 200
        users = response.json()
        assert len(users) > 0, "Need at least one assignable user"
        
        user_to_assign = users[0]
        
        # Create a fresh event
        response = api_client.post(f"{BASE_URL}/api/create-fall-event")
        if response.status_code != 200:
            pytest.skip("Could not create test event")
        event_id = response.json().get('event_id')
        
        # Assign the user
        response = api_client.patch(
            f"{BASE_URL}/api/events/{event_id}",
            json={
                "assigned_to": user_to_assign["id"],
                "assigned_to_name": user_to_assign["full_name"],
                "comment": "TEST Assignation"
            }
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        # Verify assignment was stored
        assert data.get("assigned_to") == user_to_assign["id"]
        assert data.get("assigned_to_name") == user_to_assign["full_name"]
        print(f"✓ Assignment stored correctly - user: {user_to_assign['full_name']}")
        
        # Verify via GET that assignment persisted
        get_response = api_client.get(f"{BASE_URL}/api/events/{event_id}")
        assert get_response.status_code == 200
        get_data = get_response.json()
        assert get_data.get("assigned_to_name") == user_to_assign["full_name"]
        print(f"✓ Assignment persisted in DB - GET returns assigned_to_name: {get_data.get('assigned_to_name')}")


class TestEventComments:
    """Tests for event comments endpoint"""
    
    def test_get_event_comments_returns_array(self, api_client):
        """GET /api/events/{id}/comments should return comments array for admin"""
        # Create an event with a comment
        response = api_client.post(f"{BASE_URL}/api/create-fall-event")
        if response.status_code != 200:
            pytest.skip("Could not create test event")
        event_id = response.json().get('event_id')
        
        # Add a comment via ACK with comment
        api_client.patch(
            f"{BASE_URL}/api/events/{event_id}",
            json={
                "status": "ACK",
                "comment": "TEST Comment - Prise en charge de l'alerte"
            }
        )
        
        # Get comments
        response = api_client.get(f"{BASE_URL}/api/events/{event_id}/comments")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        comments = response.json()
        
        assert isinstance(comments, list), "Response should be a list"
        assert len(comments) >= 1, "Should have at least one comment"
        
        # Verify comment structure
        comment = comments[-1]
        assert "id" in comment
        assert "user_name" in comment
        assert "text" in comment
        assert "action" in comment
        assert "created_at" in comment
        
        print(f"✓ GET /events/{event_id}/comments returns {len(comments)} comments")
        print(f"  Comment structure: user={comment['user_name']}, action={comment['action']}, text={comment['text'][:30]}...")

    def test_get_comments_for_known_event(self, api_client):
        """GET /api/events/{id}/comments for known test event should return comments"""
        # Use the known test event that has a comment according to requirements
        event_id = "57d694f0-5fd3-4db0-992d-02c10ab83bb6"
        
        response = api_client.get(f"{BASE_URL}/api/events/{event_id}/comments")
        
        # Event might not exist anymore, handle gracefully
        if response.status_code == 404:
            print(f"⚠ Test event {event_id} not found - may have been deleted")
            pytest.skip("Test event not found")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        comments = response.json()
        
        print(f"✓ Known test event has {len(comments)} comment(s)")
        if comments:
            for c in comments:
                print(f"  - {c.get('action', 'N/A')}: {c.get('text', '')[:50]}... by {c.get('user_name', 'N/A')}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
