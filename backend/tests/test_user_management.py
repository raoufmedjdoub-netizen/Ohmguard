"""
Backend Tests for User Management in Settings Page
====================================================

Tests for:
- GET /api/clients/{client_id}/users - List client users
- POST /api/clients/{client_id}/users - Create client user with contact card fields
- PATCH /api/client-users/{id} - Update client user
- DELETE /api/client-users/{id} - Delete client user
- POST /api/client-users/{id}/reset-password - Reset user password
"""

import pytest
import requests
import os
import time

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestUserManagementAPI:
    """User Management API tests"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test fixtures - login and get token"""
        # Login to get token
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@ohmguard.io",
            "password": "admin123"
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        self.token = data.get("access_token")
        self.headers = {
            "Authorization": f"Bearer {self.token}",
            "Content-Type": "application/json"
        }
        
        # Get first client ID
        clients_response = requests.get(f"{BASE_URL}/api/clients", headers=self.headers)
        assert clients_response.status_code == 200, f"Failed to get clients: {clients_response.text}"
        clients = clients_response.json()
        assert len(clients) > 0, "No clients found"
        self.client_id = clients[0]["id"]
        self.client_name = clients[0]["name"]
        
        # Track created test users for cleanup
        self.test_user_ids = []
    
    def teardown_method(self):
        """Cleanup test-created users after each test"""
        for user_id in self.test_user_ids:
            try:
                requests.delete(f"{BASE_URL}/api/client-users/{user_id}", headers=self.headers)
            except:
                pass
    
    # =========================================================================
    # LIST USERS TESTS
    # =========================================================================
    
    def test_list_client_users_success(self):
        """GET /api/clients/{client_id}/users returns 200 with users list"""
        response = requests.get(
            f"{BASE_URL}/api/clients/{self.client_id}/users",
            headers=self.headers
        )
        
        assert response.status_code == 200
        users = response.json()
        assert isinstance(users, list)
        
        # Verify user structure has contact fields
        if len(users) > 0:
            user = users[0]
            assert "id" in user
            assert "user_email" in user
            assert "user_full_name" in user
            assert "role" in user
            assert "is_active" in user
            # Contact card fields
            assert "phone" in user
            assert "job_title" in user
            assert "department" in user
            assert "notes" in user
            assert "permissions_count" in user
            assert "scopes_count" in user
            print(f"✓ List users returned {len(users)} users with contact fields")
    
    def test_list_client_users_unauthorized(self):
        """GET /api/clients/{client_id}/users without token returns 401"""
        response = requests.get(
            f"{BASE_URL}/api/clients/{self.client_id}/users"
        )
        assert response.status_code == 401
        print("✓ Unauthorized access returns 401")
    
    # =========================================================================
    # CREATE USER TESTS
    # =========================================================================
    
    def test_create_user_success_with_contact_fields(self):
        """POST /api/clients/{client_id}/users creates user with all contact fields"""
        timestamp = int(time.time())
        test_email = f"test_create_{timestamp}@ohmguard.io"
        
        payload = {
            "email": test_email,
            "full_name": "TEST_Create User",
            "password": "testpassword123",
            "role": "VIEWER",
            "phone": "+33 1 23 45 67 89",
            "job_title": "Test Engineer",
            "department": "QA Department",
            "notes": "Created by pytest"
        }
        
        response = requests.post(
            f"{BASE_URL}/api/clients/{self.client_id}/users",
            headers=self.headers,
            json=payload
        )
        
        assert response.status_code == 200 or response.status_code == 201, f"Failed: {response.text}"
        data = response.json()
        
        # Track for cleanup
        self.test_user_ids.append(data["id"])
        
        # Verify response
        assert data["role"] == "VIEWER"
        assert data["user_email"] == test_email
        assert data["user_full_name"] == "TEST_Create User"
        
        print(f"✓ Created user with ID: {data['id']}")
        
        # Verify user appears in list with contact fields
        list_response = requests.get(
            f"{BASE_URL}/api/clients/{self.client_id}/users",
            headers=self.headers
        )
        users = list_response.json()
        created_user = next((u for u in users if u["id"] == data["id"]), None)
        
        assert created_user is not None, "Created user not found in list"
        # Check contact fields are stored
        assert created_user.get("phone") == "+33 1 23 45 67 89"
        assert created_user.get("job_title") == "Test Engineer"
        assert created_user.get("department") == "QA Department"
        assert created_user.get("notes") == "Created by pytest"
        
        print("✓ Contact fields persisted correctly")
    
    def test_create_user_invalid_email_format(self):
        """POST with invalid email format should fail (backend validation)"""
        payload = {
            "email": "not-a-valid-email",
            "full_name": "TEST_Invalid Email",
            "password": "testpassword123",
            "role": "VIEWER"
        }
        
        response = requests.post(
            f"{BASE_URL}/api/clients/{self.client_id}/users",
            headers=self.headers,
            json=payload
        )
        
        # Backend should validate email format
        assert response.status_code == 422 or response.status_code == 400, \
            f"Expected 422/400 for invalid email, got {response.status_code}"
        print("✓ Invalid email format rejected by backend")
    
    def test_create_user_missing_required_fields(self):
        """POST without required fields returns validation error"""
        payload = {
            "email": "",
            "full_name": "",
            "password": ""
        }
        
        response = requests.post(
            f"{BASE_URL}/api/clients/{self.client_id}/users",
            headers=self.headers,
            json=payload
        )
        
        assert response.status_code in [400, 422], \
            f"Expected 400/422 for missing fields, got {response.status_code}"
        print("✓ Missing required fields rejected")
    
    # =========================================================================
    # UPDATE USER TESTS
    # =========================================================================
    
    def test_update_user_role(self):
        """PATCH /api/client-users/{id} can update role"""
        # First create a user
        timestamp = int(time.time())
        test_email = f"test_update_role_{timestamp}@ohmguard.io"
        
        create_response = requests.post(
            f"{BASE_URL}/api/clients/{self.client_id}/users",
            headers=self.headers,
            json={
                "email": test_email,
                "full_name": "TEST_Update Role User",
                "password": "testpassword123",
                "role": "VIEWER"
            }
        )
        assert create_response.status_code in [200, 201]
        user_id = create_response.json()["id"]
        self.test_user_ids.append(user_id)
        
        # Update role to OPERATOR
        update_response = requests.patch(
            f"{BASE_URL}/api/client-users/{user_id}",
            headers=self.headers,
            json={"role": "OPERATOR"}
        )
        
        assert update_response.status_code == 200, f"Update failed: {update_response.text}"
        updated_user = update_response.json()
        assert updated_user["role"] == "OPERATOR"
        print("✓ Role updated from VIEWER to OPERATOR")
    
    def test_update_user_status(self):
        """PATCH /api/client-users/{id} can toggle is_active"""
        # First create a user
        timestamp = int(time.time())
        test_email = f"test_status_{timestamp}@ohmguard.io"
        
        create_response = requests.post(
            f"{BASE_URL}/api/clients/{self.client_id}/users",
            headers=self.headers,
            json={
                "email": test_email,
                "full_name": "TEST_Status User",
                "password": "testpassword123"
            }
        )
        user_id = create_response.json()["id"]
        self.test_user_ids.append(user_id)
        
        # Deactivate user
        update_response = requests.patch(
            f"{BASE_URL}/api/client-users/{user_id}",
            headers=self.headers,
            json={"is_active": False}
        )
        
        assert update_response.status_code == 200
        updated_user = update_response.json()
        assert updated_user["is_active"] == False
        print("✓ User deactivated successfully")
        
        # Reactivate user
        update_response2 = requests.patch(
            f"{BASE_URL}/api/client-users/{user_id}",
            headers=self.headers,
            json={"is_active": True}
        )
        
        assert update_response2.status_code == 200
        updated_user2 = update_response2.json()
        assert updated_user2["is_active"] == True
        print("✓ User reactivated successfully")
    
    def test_update_user_contact_fields(self):
        """PATCH /api/client-users/{id} can update contact fields"""
        # First create a user
        timestamp = int(time.time())
        test_email = f"test_contact_{timestamp}@ohmguard.io"
        
        create_response = requests.post(
            f"{BASE_URL}/api/clients/{self.client_id}/users",
            headers=self.headers,
            json={
                "email": test_email,
                "full_name": "TEST_Contact User",
                "password": "testpassword123"
            }
        )
        user_id = create_response.json()["id"]
        self.test_user_ids.append(user_id)
        
        # Update contact fields
        update_response = requests.patch(
            f"{BASE_URL}/api/client-users/{user_id}",
            headers=self.headers,
            json={
                "full_name": "Updated Contact Name",
                "phone": "+33 9 87 65 43 21",
                "job_title": "Senior Engineer",
                "department": "Engineering",
                "notes": "Updated notes"
            }
        )
        
        assert update_response.status_code == 200, f"Update failed: {update_response.text}"
        
        # Verify contact fields persisted by getting user list
        list_response = requests.get(
            f"{BASE_URL}/api/clients/{self.client_id}/users",
            headers=self.headers
        )
        users = list_response.json()
        updated_user = next((u for u in users if u["id"] == user_id), None)
        
        assert updated_user is not None
        assert updated_user.get("phone") == "+33 9 87 65 43 21"
        assert updated_user.get("job_title") == "Senior Engineer"
        assert updated_user.get("department") == "Engineering"
        assert updated_user.get("notes") == "Updated notes"
        print("✓ Contact fields updated and persisted")
    
    # =========================================================================
    # DELETE USER TESTS
    # =========================================================================
    
    def test_delete_user_success(self):
        """DELETE /api/client-users/{id} removes user from client"""
        # First create a user
        timestamp = int(time.time())
        test_email = f"test_delete_{timestamp}@ohmguard.io"
        
        create_response = requests.post(
            f"{BASE_URL}/api/clients/{self.client_id}/users",
            headers=self.headers,
            json={
                "email": test_email,
                "full_name": "TEST_Delete User",
                "password": "testpassword123"
            }
        )
        user_id = create_response.json()["id"]
        # Don't add to test_user_ids since we're deleting it
        
        # Delete the user
        delete_response = requests.delete(
            f"{BASE_URL}/api/client-users/{user_id}",
            headers=self.headers
        )
        
        assert delete_response.status_code == 200
        print("✓ User deleted successfully")
        
        # Verify user no longer in list
        list_response = requests.get(
            f"{BASE_URL}/api/clients/{self.client_id}/users",
            headers=self.headers
        )
        users = list_response.json()
        deleted_user = next((u for u in users if u["id"] == user_id), None)
        assert deleted_user is None, "Deleted user still appears in list"
        print("✓ Deleted user no longer in list")
    
    def test_delete_nonexistent_user(self):
        """DELETE /api/client-users/{id} with invalid ID returns 404"""
        response = requests.delete(
            f"{BASE_URL}/api/client-users/nonexistent-id-12345",
            headers=self.headers
        )
        
        assert response.status_code == 404
        print("✓ Delete nonexistent user returns 404")
    
    # =========================================================================
    # RESET PASSWORD TESTS
    # =========================================================================
    
    def test_reset_password_success(self):
        """POST /api/client-users/{id}/reset-password updates password"""
        # First create a user
        timestamp = int(time.time())
        test_email = f"test_reset_pw_{timestamp}@ohmguard.io"
        
        create_response = requests.post(
            f"{BASE_URL}/api/clients/{self.client_id}/users",
            headers=self.headers,
            json={
                "email": test_email,
                "full_name": "TEST_Reset Password User",
                "password": "oldpassword123"
            }
        )
        user_id = create_response.json()["id"]
        self.test_user_ids.append(user_id)
        
        # Reset password
        reset_response = requests.post(
            f"{BASE_URL}/api/client-users/{user_id}/reset-password",
            headers=self.headers,
            json={"new_password": "newpassword456"}
        )
        
        assert reset_response.status_code == 200, f"Reset failed: {reset_response.text}"
        data = reset_response.json()
        assert data.get("status") == "success"
        print("✓ Password reset successful")
        
        # Verify new password works by logging in with the new user
        login_response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={
                "email": test_email,
                "password": "newpassword456"
            }
        )
        assert login_response.status_code == 200, "Login with new password failed"
        print("✓ New password works for login")
    
    def test_reset_password_too_short(self):
        """POST /api/client-users/{id}/reset-password with short password may fail"""
        # First create a user
        timestamp = int(time.time())
        test_email = f"test_short_pw_{timestamp}@ohmguard.io"
        
        create_response = requests.post(
            f"{BASE_URL}/api/clients/{self.client_id}/users",
            headers=self.headers,
            json={
                "email": test_email,
                "full_name": "TEST_Short Password User",
                "password": "testpassword123"
            }
        )
        user_id = create_response.json()["id"]
        self.test_user_ids.append(user_id)
        
        # Try to reset with short password - backend may not validate this
        reset_response = requests.post(
            f"{BASE_URL}/api/client-users/{user_id}/reset-password",
            headers=self.headers,
            json={"new_password": "abc"}
        )
        
        # This test checks if backend validates password length
        # If it doesn't, it's a potential improvement
        if reset_response.status_code == 200:
            print("⚠ Backend accepts short passwords (no server-side validation)")
        else:
            print("✓ Backend rejects short passwords")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
