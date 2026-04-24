UPDATE users SET role = 'admin', updated_at = NOW() WHERE email = 'sahil.kharatmol@kalvium.community' RETURNING id, email, role;
