import {ApolloServer} from "@apollo/server";
import {startStandaloneServer} from "@apollo/server/standalone";

const PORT = Number(process.env.PORT || 4000);

const BOOK_SERVICE_URL = process.env.BOOK_SERVICE_URL || "http://book-service:3001";
const MEMBER_SERVICE_URL = process.env.MEMBER_SERVICE_URL || "http://member-service:8081";
const LOAN_SERVICE_URL = process.env.LOAN_SERVICE_URL || "http://loan-service:5001";
const FINE_SERVICE_URL = process.env.FINE_SERVICE_URL || "http://fine-service:5002";

async function fetchJson(url, options = {}){
    const response = await fetch( url, {
        headers: {
            "Content-Type": "application/json",
            ...(options.headers || {})
        },
        ...options
    });

    const text = await response.text();

    let data;

    try {
        data = JSON.parse(text);
    } catch (error) {
        console.error(`Response dari ${url} bukan JSON`);
        console.error(text);
        throw new Error(`Response dari ${url} bukan JSON`);
    }

    if (!response.ok){
        throw new Error(data.message || "Request ke service gagal");
    }

    return data;
}

function normalizeBook(book) {
    return {
        id: book._id,
        title: book.title,
        author: book.author,
        isbn: book.isbn,
        stock: book.stock,
        category: book.category,
        createdAt: book.createdAt,
        updatedAt: book.updatedAt
    }
}

function normalizeLoan(loan){
    return {
        id: loan.id,
        member_id: loan.member_id,
        member_name: loan.member_name,
        book_id: loan.book_id,
        book_title: loan.book_title,
        status: loan.status
    };
}

const typeDefs = `#graphql
    type Book {
        id: ID!
        title: String
        author: String
        isbn: String
        stock: Int
        category: String
        createdAt: String
        updatedAt: String
    }

    type Member {
        id: ID!
        name: String
        email: String
        phone: String
        address: String
        status: String
    }

    type Loan {
        id: ID!
        member_id: Int
        member_name: String
        book_id: ID
        book_title: String
        status: String
        member: Member
        book: Book
    }

    type Fine {
        id: ID!
        customer_name: String
        amount: Int
        reason: String
    }

    type ServiceHealth {
        service: String
        language: String
        framework: String
        database: String
        status: String
    }

    type SystemStatus {
        book_service: ServiceHealth
        member_service: ServiceHealth
        loan_service: ServiceHealth
        fine_service: ServiceHealth
    }

    type Query {
        books: [Book]
        book(id: ID!): Book

        members: [Member]
        member(id: ID!): Member

        loans: [Loan]
        loan(id: ID!): Loan

        fines: [Fine]
        fine(id: ID!): Fine

        systemStatus: SystemStatus
    }

    type Mutation {
        createBook(
            title: String!
            author: String!
            isbn: String!
            stock: Int
            category: String
        ): Book

        createMember(
            name: String!
            email: String!
            phone: String
            address: String
            status: String
        ): Member

        createLoan(
            member_id: Int!
            book_id: ID!
        ): Loan

        updateBook(
            id: ID!
            title: String
            author: String
            isbn: String
            stock: Int
            category: String
        ): Book

        updateMember(
            id: ID!
            name: String
            email: String
            phone: String
            address: String
            status: String
        ): Member

        updateLoanStatus(
            id: ID!
            status: String!
        ): Loan

        createFine(
            customer_name: String!
            amount: Int!
            reason: String
        ): Fine

        updateFine(
            id: ID!
            customer_name: String!
            amount: Int!
            reason: String
        ): Fine

        deleteBook(id: ID!): Boolean
        deleteMember(id: ID!): Boolean
        deleteLoan(id: ID!): Boolean
        deleteFine(id: ID!): Boolean
    }
`;

const resolvers = {
    Query: {
        books: async () => {
            const result = await fetchJson(
                `${BOOK_SERVICE_URL}/books`
            );
            return result.data.map(normalizeBook);
        },

        book: async (_, { id }) => {
            const result = await fetchJson(
                `${BOOK_SERVICE_URL}/books/${id}`
            );

            return normalizeBook(result.data);
        },

        members: async () => {
            const result = await fetchJson(
                `${MEMBER_SERVICE_URL}/members`
            );

            return result.data;
        },

        member: async (_, { id }) => {
            const result = await fetchJson(
                `${MEMBER_SERVICE_URL}/members/${id}`
            );

            return result.data;
        },

        loans: async () => {
            const result = await fetchJson(
                `${LOAN_SERVICE_URL}/loans`
            );

            return result.data.map(normalizeLoan);
        },

        loan: async (_, { id }) => {
            const result = await fetchJson(
                `${LOAN_SERVICE_URL}/loans/${id}`
            );

            return normalizeLoan(result.data || result);
        },

        fines: async () => {
            const result = await fetchJson(
                `${FINE_SERVICE_URL}/fines`
            );
            return result.data
        },

        fine: async (_,{ id }) => {
            const result = await fetchJson(
                `${FINE_SERVICE_URL}/fines/${id}`
            );
            return result.data || result;
        },

        systemStatus: async () => {
            const [
                bookHealth,
                memberHealth,
                loanHealth,
                fineHealth
            ] = await Promise.all([
                fetchJson(`${BOOK_SERVICE_URL}/health`),
                fetchJson(`${MEMBER_SERVICE_URL}/health`),
                fetchJson(`${LOAN_SERVICE_URL}/health`),
                fetchJson(`${FINE_SERVICE_URL}/health`)
            ]);

            return {
                book_service: bookHealth,
                member_service: memberHealth,
                loan_service: loanHealth,
                fine_service: fineHealth
            };
        }
    },

    Loan: {
        member: async (loan) => {
            if (!loan.member_id) {
                return null;
            }

            const result = await fetchJson(
                `${MEMBER_SERVICE_URL}/members/${loan.member_id}`
            );

            return result.data;
        },

        book: async (loan) => {
            if (!loan.book_id){
                return null;
            }

            const result =  await fetchJson(
                `${BOOK_SERVICE_URL}/books/${loan.book_id}`
            );

            return normalizeBook(result.data);
        }
    },

    Mutation: {
        createBook: async (
            _,
            {
                title,
                author,
                isbn,
                stock,
                category
            }
        ) => {
            const result = await fetchJson(
                `${BOOK_SERVICE_URL}/books`,
                {
                    method: "POST",
                    body: JSON.stringify({
                        title,
                        author,
                        isbn,
                        stock,
                        category
                    })
                }
            );
            return normalizeBook(result.data);
        },

        updateBook: async (
            _, 
            {
                id,
                title,
                author,
                isbn,
                stock,
                category
            }
        ) => {
            const payload = {};

            if (title !== undefined) payload.title = title;
            if (author !== undefined) payload.author = author;
            if (isbn !== undefined) payload.isbn = isbn;
            if (stock !== undefined) payload.stock = stock;
            if (category !== undefined) payload.category = category;

            const result = await fetchJson(
                `${BOOK_SERVICE_URL}/books/${id}`,
                {
                    method: "PUT",
                    body: JSON.stringify(payload)
                }
            );

            return normalizeBook(result.data);
        },

        deleteBook: async (_, { id }) => {
            await fetchJson(
                `${BOOK_SERVICE_URL}/books/${id}`,
                {
                    method: "DELETE"
                }
            );

            return true;
        },

        createMember: async (
            _,
            {
                name,
                email,
                phone,
                address,
                status
            }
        ) => {
            const result = await fetchJson(
                `${MEMBER_SERVICE_URL}/members`,
                {
                    method: "POST",
                    body: JSON.stringify({
                        name,
                        email,
                        phone,
                        address,
                        status
                    })
                }
            );
            return result.data;
        },

        updateMember: async (
            _, 
            { 
                id, 
                name, 
                email, 
                phone, 
                address, 
                status 
            }
        ) => {
            const payload = {};

            if (name !== undefined) payload.name = name;
            if (email !== undefined) payload.email = email;
            if (phone !== undefined) payload.phone = phone;
            if (address !== undefined) payload.address = address;
            if (status !== undefined) payload.status = status;

            const result = await fetchJson(
                `${MEMBER_SERVICE_URL}/members/${id}`,
                {
                method: "PUT",
                body: JSON.stringify(payload)
                }
            );
            return result.data;
        },

        deleteMember: async (_, {id}) => {
            await fetchJson(
                `${MEMBER_SERVICE_URL}/members/${id}`,
                {
                    method: "DELETE"
                }
            );
            return true;
        },

        createLoan: async (_, {member_id, book_id}) => {
            const result = await fetchJson(
                `${LOAN_SERVICE_URL}/loans`,
                {
                    method: "POST",
                    body: JSON.stringify({
                       member_id,
                       book_id 
                    })
                }
            );

            return normalizeLoan(result.data);
        },

        updateLoanStatus: async (_, { id, status }) => {
            const result = await fetchJson(
                `${LOAN_SERVICE_URL}/loans/${id}`,
                {
                    method: "PUT",
                    body: JSON.stringify({
                        status
                    })
                }
            );
            return normalizeLoan(result.data);
        },

        deleteLoan: async (_, { id }) => {
            await fetchJson(
                `${LOAN_SERVICE_URL}/loans/${id}`,
                {
                    method: "DELETE"
                }
            );
            return true;
        },

        createFine: async (
            _,
            {
                customer_name,
                amount,
                reason
            }
        ) => {
            const result = await fetchJson(
                `${FINE_SERVICE_URL}/fines`,
                {
                    method: "POST",
                    body: JSON.stringify({
                        customer_name,
                        amount,
                        reason
                    })
                }
            );
            return result.data;
        },

        updateFine: async (
            _,
            {
                id,
                customer_name,
                amount,
                reason
            }
        ) => {
            const result = await fetchJson(
                `${FINE_SERVICE_URL}/fines/${id}`,
                {
                    method: "PUT",
                    body: JSON.stringify({
                        customer_name,
                        amount,
                        reason
                    })
                }
            );

            return result.data;
        },

        deleteFine: async (_, { id }) => {
            await fetchJson(
                `${FINE_SERVICE_URL}/fines/${id}`,
                {
                    method: "DELETE"
                }
            );
            return true;
        }
    }
};

const server = new ApolloServer({
    typeDefs,
    resolvers
});

const {url} = await startStandaloneServer(server, {
    listen: {
        host: "0.0.0.0",
        port: PORT
    }
});

console.log(`GraphQl Gateway berjalan pada ${url}`);
