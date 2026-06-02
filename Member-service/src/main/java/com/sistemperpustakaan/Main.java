package com.sistemperpustakaan;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.List;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;

public class Main {

    private static final int PORT = 8081;

    private static final String DB_HOST = System.getenv().getOrDefault("DB_HOST", "member-db");
    private static final String DB_NAME = System.getenv().getOrDefault("DB_NAME", "member_db");
    private static final String DB_USER = System.getenv().getOrDefault("DB_USER", "member_user");
    private static final String DB_PASSWORD = System.getenv().getOrDefault("DB_PASSWORD", "member_password");

    private static final String DB_URL = "jdbc:mysql://" + DB_HOST + ":3306/" + DB_NAME  + "?useSSL=false&allowPublicKeyRetrieval=true&serverTimezone=UTC";

    public static void main(String[] args) throws Exception {
        waitForDatabase();
        initDatabase();

        HttpServer server = HttpServer.create(new InetSocketAddress("0.0.0.0", PORT),0);

        server.createContext("/health", Main::handleHealth);
        server.createContext("/members", Main::handleMembers);

        server.setExecutor(null);
        server.start();

        System.out.println("Member Service berjalan dengan port" + PORT);
    }

    private static Connection getConnection() throws SQLException {
        return DriverManager.getConnection(DB_URL, DB_USER, DB_PASSWORD);
    }

    private static void waitForDatabase() throws InterruptedException {
        int retries = 20;

        for (int i = 1; i <= retries; i++){
            try (Connection connection = getConnection()) {
                System.out.println("Berhasil terhubung ke database MySQL");
                return;
            } catch (SQLException e) {
                System.out.println("Menunggu database siap... percobaan" + i);
                Thread.sleep(3000);
            }
        }

        throw new RuntimeException("Gagal terhubung ke databse MySQL");
    }

    private static void initDatabase() {
        String createTableSQL = """
                Create table if not exists members (
                    id int auto_increment primary key,
                    name varchar(100) not null,
                    email varchar(100) not null,
                    phone varchar (12),
                    address varchar(255),
                    status varchar(30)
                )
                """;
        String countSql = "select count(*) from members";
        String insertSql = """
                insert into members (name, email, phone, address, status) values
                ('Nafi Maula', 'nafi@gmail.com', '081234567890', 'Jl. Merdeka No. 1', 'active'),
                ('Rina Yulia', 'Rin@gmail.com', '089876543210', 'Jl. Pramuka No. 2', 'inactive')
                """;
        try (Connection connection = getConnection();
            Statement statement = connection.createStatement()){
                statement.execute(createTableSQL);

                ResultSet resultSet = statement.executeQuery(countSql);
                resultSet.next();
                int total = resultSet.getInt(1);
                if (total == 0) {
                    statement.execute(insertSql);
                }
                System.out.println("Tabel member siap digunakan");
        } catch (SQLException e){
            throw new RuntimeException("Gagal inisialisasi database", e);
        }
    }

    private static void handleHealth(HttpExchange exchange) {
        if (!exchange.getRequestMethod().equalsIgnoreCase("GET")){
            sendJson(exchange, 405, """
                    {
                    "message": "Method Tidak Diizinkan"
                    }
                    """);
            return;
        }

        String response = """
                {
                    "service": "member-service",
                    "language": "Java",
                    "framework": "Native Java HTTP Server",
                    "database": "MySQL",
                    "status": "running"
                }
                """;
        sendJson(exchange, 200, response);
    }

    private static void handleMembers(HttpExchange exchange){
        String method = exchange.getRequestMethod();
        String path = exchange.getRequestURI().getPath();

        try {
            if (method.equalsIgnoreCase("GET") && path.equals("/members")){
                getAllMembers(exchange);
            } else if (method.equalsIgnoreCase("GET") && path.matches("/members/\\d+")) {
                int id = getIdFromPath(path);
                getMemberById(exchange, id);
            } else if (method.equalsIgnoreCase("POST") && path.equals("/members")){
                createMember(exchange);
            } else if (method.equalsIgnoreCase("PUT") && path.matches("/members/\\d+")){
                int id = getIdFromPath(path);
                updateMember(exchange, id);
            } else if (method.equalsIgnoreCase("DELETE") && path.matches("/members/\\d+")){
                int id = getIdFromPath(path);
                deleteMember(exchange, id);
            } else {
                sendJson(exchange, 404, """
                        {
                        "message": "Endpoint Tidak Ditemukan"
                        }
                        """);
            }
        } catch (Exception e) {
            sendJson(exchange, 500, """
                    {
                    "message": "Terjadi kesalahan pada server",
                    "error": "%s"
                    }
                    """.formatted(e.getMessage()));
        }
    }

    private static void getAllMembers(HttpExchange exchange) throws SQLException {
        List<String> members = new ArrayList<>();

        String sql = "select id, name, email, phone, address, status from members order by id ASC";

        try (Connection connection = getConnection();
            PreparedStatement preparedStatement = connection.prepareStatement(sql);
            ResultSet resultSet = preparedStatement.executeQuery()){
            while (resultSet.next()){
                members.add(memberToJson(resultSet));
            }
        }
        String response = """
                {
                "service": "member-service",
                "message": "Daftar anggota perpustakaan",
                "data": [%s]
                }
                """.formatted(String.join(",", members));
        sendJson(exchange, 200, response);
    }
    private static void getMemberById(HttpExchange exchange, int id) throws SQLException {
        String sql = "select id, name, email, phone, address, status from members where id = ?";

        try (Connection connection = getConnection();
        PreparedStatement preparedStatement = connection.prepareStatement(sql)){
            preparedStatement.setInt(1, id);
            try (ResultSet resultSet = preparedStatement.executeQuery()){
                if (resultSet.next()){
                    String response = """
                            {
                            "service": "member-service",
                            "message": "Detail anggota perpustakaan",
                            "data": %s
                            }
                            """.formatted(memberToJson(resultSet));
                    sendJson(exchange, 200, response);
                } else {
                    sendJson(exchange, 404, """
                            {
                            "service": "member-service",
                            "message": "Anggota tidak ditemukan"
                            }
                            """);
                }
            }
        }
    }
    private static void createMember(HttpExchange exchange) throws Exception {
        String body = readRequestBody(exchange);

        String name = getJsonValue(body, "name");
        String email = getJsonValue(body, "email");
        String phone = getJsonValue(body, "phone");
        String address = getJsonValue(body, "address");
        String status = getJsonValue(body, "status");

        if (name == null || email == null) {
            sendJson(exchange, 400, """
                    {
                    "message": "Nama dan email wajib diisi"
                    }
                    """);
            return;
        }

        String sql = "insert into members (name, email, phone, address, status) values (?, ?, ?, ?, ?)";

        try (Connection connection = getConnection();
        PreparedStatement preparedStatement = connection.prepareStatement(sql, Statement.RETURN_GENERATED_KEYS)){
            preparedStatement.setString(1, name);
            preparedStatement.setString(2, email);
            preparedStatement.setString(3, phone);
            preparedStatement.setString(4, address);
            preparedStatement.setString(5, status);
            preparedStatement.executeUpdate();

            ResultSet generatedKeys = preparedStatement.getGeneratedKeys();
            generatedKeys.next();
            int id = generatedKeys.getInt(1);
            String response = """
                    {
                    "service": "member-service",
                    "message": "Anggota berhasil ditambahkan",
                    "data": {
                        "id": %d,
                        "name": "%s",
                        "email": "%s",
                        "phone": "%s",
                        "address": "%s",
                        "status": "%s"
                    }
                    }
                    """.formatted(id, escapeJson(name), escapeJson(email), escapeJson(nullToEmpty(phone)), escapeJson(nullToEmpty(address)), escapeJson(nullToEmpty(status))
                );
            sendJson(exchange, 201, response);
        }
    }

    private static void updateMember(HttpExchange exchange, int id) throws Exception {
        String body = readRequestBody(exchange);

        String name = getJsonValue(body, "name");
        String email = getJsonValue(body, "email");
        String phone = getJsonValue(body, "phone");
        String address = getJsonValue(body, "address");
        String status = getJsonValue(body, "status");

        String sql = """
                update members set
                name = ?, email = ?, phone = ?, address = ?, status = ?
                where id = ?
                """;
        try (Connection connection = getConnection();
        PreparedStatement preparedStatement = connection.prepareStatement(sql)){
            preparedStatement.setString(1, name);
            preparedStatement.setString(2, email);
            preparedStatement.setString(3, phone);
            preparedStatement.setString(4, address);
            preparedStatement.setString(5, status);
            preparedStatement.setInt(6, id);

            int affectedRows = preparedStatement.executeUpdate();

            if (affectedRows == 0){
                sendJson(exchange, 404, """
                        {
                        "service": "member-service",
                        "message": "Anggota tidak ditemukan"
                        }
                        """);
                return;
            }
            String response = """
                    {
                    "service": "member-service",
                    "message": "Anggota berhasil diperbarui",
                    "data": {
                        "id": %d,
                        "name": "%s",
                        "email": "%s",
                        "phone": "%s",
                        "address": "%s",
                        "status": "%s"
                    }
                    }
                    """.formatted(id, escapeJson(nullToEmpty(name)), escapeJson(nullToEmpty(email)), escapeJson(nullToEmpty(phone)), escapeJson(nullToEmpty(address)), escapeJson(nullToEmpty(status))
                );
            sendJson(exchange, 200, response);
        }
    }

    private static void deleteMember(HttpExchange exchange, int id) throws SQLException {
        String sql = "delete from members where id = ?";

        try (Connection connection = getConnection();
        PreparedStatement preparedStatement = connection.prepareStatement(sql)){
            preparedStatement.setInt(1, id);
            int affectedRows = preparedStatement.executeUpdate();

            if (affectedRows == 0){
                sendJson(exchange, 404, """
                        {
                        "service": "member-service",
                        "message": "Anggota tidak ditemukan"
                        }
                        """);
            } else {
                sendJson(exchange, 200, """
                        {
                        "service": "member-service",
                        "message": "Anggota berhasil dihapus"
                        }
                        """);
            }
        }
    }

    private static String memberToJson(ResultSet resultSet) throws SQLException {
        return """
                {
                "id": %d,
                "name": "%s",
                "email": "%s",
                "phone": "%s",
                "address": "%s",
                "status": "%s"
                }
                """.formatted(
                    resultSet.getInt("id"),
                    escapeJson(resultSet.getString("name")),
                    escapeJson(resultSet.getString("email")),
                    escapeJson(nullToEmpty(resultSet.getString("phone"))),
                    escapeJson(nullToEmpty(resultSet.getString("address"))),
                    escapeJson(nullToEmpty(resultSet.getString("status")))
        );
    }

    private static int getIdFromPath(String path){
        String[] parts = path.split("/");
        return Integer.parseInt(parts[2]);
    }

    private static String readRequestBody(HttpExchange exchange) throws Exception {
        StringBuilder body = new StringBuilder();
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(exchange.getRequestBody()))){
            String line;
            while ((line = reader.readLine()) != null){
                body.append(line);
            }
        }
        return body.toString();
    }

    private static String getJsonValue(String json, String key){
        String searchKey = "\"" + key + "\"";
        int index = json.indexOf(searchKey);

        if (index == -1) {
            return null;
        }

        int colonIndex = json.indexOf(":", index);
        int firstQuoteIndex = json.indexOf("\"", colonIndex + 1);
        int secondQuoteIndex = json.indexOf("\"", firstQuoteIndex + 1);

        if (colonIndex == -1 || firstQuoteIndex == -1 || secondQuoteIndex == -1) {
            return null;
        }

        return json.substring(firstQuoteIndex + 1, secondQuoteIndex);
    }

    private static void sendJson(HttpExchange exchange, int statusCode, String response) {
        try {
            byte[] responseBytes = response.getBytes();

            exchange.getResponseHeaders().set("Content-Type", "application/json");
            exchange.sendResponseHeaders(statusCode, responseBytes.length);

            OutputStream outputStream = exchange.getResponseBody();
            outputStream.write(responseBytes);
            outputStream.close();
        } catch (Exception e) {
            System.out.println("Gagal mengirim response: " + e.getMessage());
        }
    }

    private static String escapeJson(String value) {
        if (value == null) {
            return "";
        }
        return value.replace("\\", "\\\\").replace("\"", "\\\"");
    }

    private static String nullToEmpty(String value) {
        return value == null ? "" : value;
    }
}