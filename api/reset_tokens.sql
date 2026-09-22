CREATE TABLE reset_tokens (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  token_hash CHAR(64) NOT NULL,
  expires_at DATETIME NOT NULL,
  used_at DATETIME NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX (user_id),
  INDEX (token_hash),
  CONSTRAINT fk_reset_tokens_user
    FOREIGN KEY (user_id) REFERENCES users(user_id)
    ON DELETE CASCADE
);
